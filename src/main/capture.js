// Full-resolution screen capture, returned as a base64 PNG string.
//
// On macOS we shell out to the native `screencapture` tool (reliable,
// full-res, captures the main display). The overlay window has content
// protection enabled, so it is excluded from this capture automatically.
// On other platforms we fall back to Electron's desktopCapturer.
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const os = require('os');
const path = require('path');

const execFileP = promisify(execFile);

async function captureMac() {
  const tmp = path.join(os.tmpdir(), `cluely-shot-${process.pid}-${Date.now()}.png`);
  // -x: silent (no shutter sound/flash), -D 1: main display, -t png
  await execFileP('screencapture', ['-x', '-D', '1', '-t', 'png', tmp]);
  const buf = fs.readFileSync(tmp);
  fs.unlink(tmp, () => {});
  return buf.toString('base64');
}

async function captureGeneric() {
  const { desktopCapturer, screen } = require('electron');
  const display = screen.getPrimaryDisplay();
  const scale = display.scaleFactor || 1;
  const width = Math.round(display.size.width * scale);
  const height = Math.round(display.size.height * scale);
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width, height },
  });
  if (!sources.length) throw new Error('No screen source available to capture.');
  return sources[0].thumbnail.toPNG().toString('base64');
}

async function captureScreen() {
  return process.platform === 'darwin' ? captureMac() : captureGeneric();
}

module.exports = { captureScreen };
