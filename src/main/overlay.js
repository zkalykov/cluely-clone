// Creates the transparent, always-on-top overlay window and applies the
// "stealth" properties that keep it out of screen shares / recordings.
const { BrowserWindow, screen } = require('electron');
const path = require('path');
const store = require('./store');

function createOverlay() {
  const settings = store.read();
  const { workArea } = screen.getPrimaryDisplay();
  const width = 480;
  const height = 620;
  const x = settings.x ?? Math.round(workArea.x + (workArea.width - width) / 2);
  const y = settings.y ?? workArea.y + 40;

  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: true,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    focusable: true,
    show: false,                 // shown without focus on ready-to-show (see below)
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  // ── Stealth ──────────────────────────────────────────────────────────────
  // Exclude the window from screen capture / sharing / recording APIs.
  win.setContentProtection(true);
  // Float above everything, including full-screen apps and other workspaces.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (typeof win.setHiddenInMissionControl === 'function') {
    win.setHiddenInMissionControl(true);
  }

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Appear on top WITHOUT stealing focus, so the user's active app stays focused.
  win.once('ready-to-show', () => win.showInactive());

  // Persist position when the user drags the window.
  win.on('moved', () => {
    const [nx, ny] = win.getPosition();
    store.write({ x: nx, y: ny });
  });

  return win;
}

module.exports = { createOverlay };
