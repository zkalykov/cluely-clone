require('dotenv').config();

const { app, ipcMain, globalShortcut, nativeImage } = require('electron');
const { createOverlay } = require('./overlay');
const shortcuts = require('./shortcuts');
const capture = require('./capture');
const engine = require('./engine');
const store = require('./store');

let win = null;
let pinned = true;           // true = always clickable (default); false = hover-to-interact (click-through except over the panel)
let abortCurrent = null;     // { fn } token owned by the in-flight generation
let inFlight = null;         // promise that settles when the in-flight generation ends
let quitting = false;        // true only when we're really quitting (so ⌘W can't close it)

// Pending screenshots queued for the next question.
// Each item: { id, data (full-res base64 PNG), thumb (small data URL) }.
let queue = [];
let nextId = 1;

function send(payload) {
  if (win && !win.isDestroyed()) win.webContents.send('cluely:ai', payload);
}

// ── Screenshot queue ────────────────────────────────────────────────────────

function sendQueue() {
  send({ kind: 'queue', items: queue.map((q) => ({ id: q.id, thumb: q.thumb })), count: queue.length });
}

async function addScreenshot() {
  try {
    const data = await capture.captureScreen();
    const img = nativeImage.createFromBuffer(Buffer.from(data, 'base64'));
    const thumb = img.isEmpty() ? '' : img.resize({ width: 220 }).toDataURL();
    queue.push({ id: nextId++, data, thumb });
    sendQueue();
    send({ kind: 'status', text: `${queue.length} screenshot${queue.length > 1 ? 's' : ''} queued` });
  } catch (e) {
    send({ kind: 'error', message: String((e && e.message) || e) });
  }
}

function clearQueue() {
  queue = [];
  sendQueue();
}

function removeScreenshot(id) {
  queue = queue.filter((q) => q.id !== id);
  sendQueue();
}

// ── Generation (serialized so shared state never overlaps) ───────────────────

async function generate(req) {
  // Abort and fully drain any prior generation before starting a new one, so the
  // shared conversation history and abort handler can't be corrupted by overlap.
  if (abortCurrent && abortCurrent.fn) { try { abortCurrent.fn(); } catch { /* noop */ } }
  if (inFlight) { try { await inFlight; } catch { /* noop */ } }

  const token = { fn: null };
  abortCurrent = token;
  let settle;
  inFlight = new Promise((r) => { settle = r; });

  let ok = false;
  try {
    await engine.streamAnswer(req, {
      onThinkingStart: () => send({ kind: 'thinking-start' }),
      onThinking: (t) => send({ kind: 'thinking', text: t }),
      onTextStart: () => send({ kind: 'text-start' }),
      onText: (t) => send({ kind: 'text', text: t }),
      onDone: (usage) => send({ kind: 'done', usage }),
      registerAbort: (fn) => { token.fn = fn; },
    });
    ok = true;
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (!/abort/i.test(msg)) send({ kind: 'error', message: msg });
  } finally {
    if (abortCurrent === token) abortCurrent = null;
    settle();
  }
  return ok;
}

// ── Actions (hotkeys + IPC) ──────────────────────────────────────────────────

async function solveQueue() {
  if (!win) return;
  send({ kind: 'start' });
  let images;
  if (queue.length === 0) {
    send({ kind: 'status', text: 'Capturing screen…' });
    try {
      images = [await capture.captureScreen()];
    } catch (e) {
      send({ kind: 'error', message: String((e && e.message) || e) });
      return;
    }
  } else {
    images = queue.map((q) => q.data);
  }
  send({ kind: 'status', text: 'Thinking…' });
  const ok = await generate({
    text: 'Solve the problem or answer the question shown in the screenshot(s).',
    images,
  });
  if (ok) clearQueue();
}

function toggleVisible() {
  if (!win) return;
  if (win.isVisible()) {
    win.hide();
  } else {
    win.showInactive(); // re-show without stealing focus from the active app
    win.setAlwaysOnTop(true, 'screen-saver');
  }
}

function setIgnore(ignore) {
  if (win) win.setIgnoreMouseEvents(ignore, { forward: true });
}

// PINNED  -> the panel is always clickable/draggable (a normal floating window).
// AUTO    -> click-through, except the renderer toggles clickability on hover.
function applyPinned() {
  setIgnore(!pinned);
  send({ kind: 'pinned', pinned });
}

// Bring the app to the front and give the window + its web contents keyboard
// focus. Required so the text box can actually receive typing — clicking an
// always-on-top overlay doesn't reliably make it the macOS key window on its own.
function activate() {
  if (!win) return;
  if (!win.isVisible()) win.show();
  win.setAlwaysOnTop(true, 'screen-saver');
  if (process.platform === 'darwin') { try { app.focus({ steal: true }); } catch { /* noop */ } }
  win.focus();
  win.webContents.focus();
}
const focusWindow = activate;

function setPinned(on) {
  pinned = !!on;
  applyPinned();
  if (pinned) focusWindow();
}

function togglePinned() {
  setPinned(!pinned);
}

// Hover events from the renderer drive click-through in AUTO mode only.
function onHover(over) {
  if (!pinned) setIgnore(!over);
}

// Pin (make clickable) and drop the cursor into the question box.
function focusInput() {
  setPinned(true);
  send({ kind: 'focus-input' });
}

function move(dx, dy) {
  if (!win) return;
  const [x, y] = win.getPosition();
  win.setPosition(x + dx, y + dy);
  store.write({ x: x + dx, y: y + dy });
}

function scroll(dir) {
  send({ kind: 'scroll', dir });
}

function toggleListen() {
  send({ kind: 'toggle-listen' });
}

function reset() {
  engine.reset();
  clearQueue();
  send({ kind: 'reset' });
}

// Re-send state the renderer needs once it has actually loaded (avoids the
// startup race where the first IPC events are dropped before listeners attach).
function pushInitialState() {
  applyPinned();
  const a = engine.describe();
  send({ kind: 'auth', ok: a.ok, label: a.label });
  sendQueue();
  // Note: we deliberately do NOT activate/focus on launch — the overlay should
  // appear without taking focus from the user's active app. Focus is acquired
  // on demand when they click the box, the ✏ button, or press ⌘/Ctrl+Shift+I.
}

// ── IPC from the renderer ─────────────────────────────────────────────────────

ipcMain.handle('cluely:capture', () => addScreenshot());
ipcMain.handle('cluely:solve', () => solveQueue());
ipcMain.handle('cluely:clear-queue', () => clearQueue());
ipcMain.handle('cluely:remove-screenshot', (_e, id) => removeScreenshot(id));
ipcMain.handle('cluely:toggle-interact', () => togglePinned());
ipcMain.handle('cluely:set-interactive', (_e, on) => setPinned(on));
ipcMain.handle('cluely:focus-input', () => focusInput());
ipcMain.on('cluely:hover', (_e, over) => onHover(over));
ipcMain.on('cluely:activate', () => activate());

ipcMain.handle('cluely:ask-text', async (_e, text) => {
  if (!text || !text.trim()) return;
  send({ kind: 'start' });
  send({ kind: 'status', text: 'Thinking…' });
  const hadShots = queue.length > 0;
  const ok = await generate({ text: text.trim(), images: hadShots ? queue.map((q) => q.data) : [] });
  if (ok && hadShots) clearQueue();
});

ipcMain.handle('cluely:audio', async (_e, { buffer, mime }) => {
  send({ kind: 'start' });
  send({ kind: 'status', text: 'Transcribing…' });
  try {
    const transcript = await engine.transcribe(Buffer.from(buffer), mime);
    if (!transcript) { send({ kind: 'error', message: 'No speech detected.' }); return; }
    send({ kind: 'transcript', text: transcript });
    send({ kind: 'status', text: 'Thinking…' });
    const hadShots = queue.length > 0;
    const text = `This was just said (transcribed from audio):\n"""${transcript}"""\n\nGive me the answer so I can respond.`;
    const ok = await generate({ text, images: hadShots ? queue.map((q) => q.data) : [] });
    if (ok && hadShots) clearQueue();
  } catch (e) {
    send({ kind: 'error', message: String((e && e.message) || e) });
  }
});

ipcMain.handle('cluely:reset', () => reset());
ipcMain.handle('cluely:quit', () => app.quit());
ipcMain.handle('cluely:get-hotkeys', () => shortcuts.HOTKEYS);
ipcMain.on('cluely:listening-state', (_e, on) =>
  send({ kind: 'status', text: on ? 'Listening… (⌘/Ctrl+Shift+L to stop)' : '' })
);

// ── App lifecycle ─────────────────────────────────────────────────────────────

// Accessory mode (no Dock icon, not in Cmd-Tab) is the default: it lets the
// overlay appear WITHOUT stealing focus from the user's active app on launch.
// Keyboard focus is taken on demand instead (activate(), on click/type/hotkey).
// Set CLUELY_STEALTH=0 to run as a normal Dock app if typing ever misbehaves.
const STEALTH = (process.env.CLUELY_STEALTH || '1') !== '0';

// Print the overlay's controls to the terminal it was launched from.
function printBanner() {
  const tty = process.stdout.isTTY;
  const a = tty ? '\x1b[38;5;111m' : '';
  const d = tty ? '\x1b[2m' : '';
  const b = tty ? '\x1b[1m' : '';
  const r = tty ? '\x1b[0m' : '';
  const bar = tty ? '\x1b[38;5;240m' : '';
  const auth = engine.describe();
  const ac = tty ? (auth.ok ? '\x1b[38;5;78m' : '\x1b[38;5;179m') : '';
  console.log('');
  console.log(`  ${b}${a}◆  AI Assistant${r}  ${d}· overlay${r}`);
  console.log(`  ${bar}────────────────────────────────────────────${r}`);
  console.log(`  ${d}Show / hide${r}   ${b}⌘ \\${r}   ${d}— hide it from view${r}`);
  console.log(`  ${d}Type${r}          ${b}⌘ ⇧ I${r}`);
  console.log(`  ${d}Capture${r}       ${b}⌘ H${r}   ${d}· Solve${r}  ${b}⌘ ⏎${r}`);
  console.log(`  ${d}Listen${r}        ${b}⌘ ⇧ L${r}`);
  console.log(`  ${d}Quit${r}          ${b}⌘ ⇧ Q${r}   ${d}(⌘W only hides — it won't quit)${r}`);
  console.log(`  ${d}Auth${r}          ${ac}${auth.label}${r}`);
  console.log('');
}

app.on('before-quit', () => { quitting = true; });

app.whenReady().then(() => {
  if (process.platform === 'darwin' && STEALTH) {
    app.dock?.hide();
    app.setActivationPolicy?.('accessory');
  }

  win = createOverlay();
  applyPinned();
  win.webContents.on('did-finish-load', pushInitialState);

  // ⌘W (or any window-close) hides the overlay instead of closing/quitting it.
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });

  shortcuts.register({
    addScreenshot, solveQueue, clearQueue, toggleListen,
    toggleVisible, toggleInteract: togglePinned, focusInput, reset, move, scroll,
    quit: () => app.quit(),
  });

  printBanner();
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
