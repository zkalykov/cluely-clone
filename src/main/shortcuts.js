// System-wide hotkeys. They fire even when the overlay isn't focused, which is
// what makes the app usable without ever clicking it. Everything is also
// available by mouse (drag the top bar; use the toolbar buttons), so hotkeys
// are a convenience, not a requirement.
const { globalShortcut } = require('electron');

const STEP = 48; // pixels per arrow nudge
const isMac = process.platform === 'darwin';

// Move keys avoid Option/Alt on macOS (⌘+Ctrl+Arrow) — Option isn't always
// reachable and ⌘+Option+Arrow collides with browser tab switching.
const MOVE_PREFIX = isMac ? 'Command+Control+' : 'Control+Alt+';
const MOVE_LABEL = isMac ? '⌘ + ⌃ + ← ↑ ↓ →' : 'Ctrl + Alt + ← ↑ ↓ →';

const HOTKEYS = [
  ['⌘/Ctrl + H', 'Add a screenshot to the queue'],
  ['⌘/Ctrl + Enter', 'Solve queued screenshots'],
  ['⌘/Ctrl + Shift + I', 'Type a question (focus the box)'],
  ['⌘/Ctrl + Shift + X', 'Clear screenshots'],
  ['⌘/Ctrl + Shift + L', 'Toggle listening (mic)'],
  [MOVE_LABEL, 'Move the overlay (or drag the top bar)'],
  ['⌘/Ctrl + Shift + ↑ / ↓', 'Scroll the answer'],
  ['⌘/Ctrl + Shift + Space', 'Pin ↔ auto (click-through)'],
  ['⌘/Ctrl + \\', 'Show / hide overlay'],
  ['⌘/Ctrl + Shift + R', 'New conversation'],
  ['⌘/Ctrl + Shift + Q', 'Quit'],
];

function reg(accel, fn) {
  const ok = globalShortcut.register(accel, fn);
  if (!ok) console.warn(`[cluely] failed to register hotkey: ${accel}`);
}

function register(a) {
  reg('CommandOrControl+H', a.addScreenshot);
  reg('CommandOrControl+Enter', a.solveQueue);
  reg('CommandOrControl+Shift+I', a.focusInput);
  reg('CommandOrControl+Shift+X', a.clearQueue);
  reg('CommandOrControl+Shift+L', a.toggleListen);
  reg('CommandOrControl+\\', a.toggleVisible);
  reg('CommandOrControl+Shift+Space', a.toggleInteract);
  reg('CommandOrControl+Shift+R', a.reset);
  reg('CommandOrControl+Shift+Q', a.quit);
  reg('CommandOrControl+Shift+Up', () => a.scroll('up'));
  reg('CommandOrControl+Shift+Down', () => a.scroll('down'));
  // Move the overlay (no Option/Alt on macOS — see MOVE_PREFIX above).
  reg(`${MOVE_PREFIX}Up`, () => a.move(0, -STEP));
  reg(`${MOVE_PREFIX}Down`, () => a.move(0, STEP));
  reg(`${MOVE_PREFIX}Left`, () => a.move(-STEP, 0));
  reg(`${MOVE_PREFIX}Right`, () => a.move(STEP, 0));
}

module.exports = { register, HOTKEYS };
