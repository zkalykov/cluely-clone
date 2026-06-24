#!/usr/bin/env node
// `npm run dev` — start both the web app and the stealth overlay together.
// The web server prints its link to the terminal and does NOT open a browser.
const { spawn } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const children = [];
let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) { try { c.kill('SIGTERM'); } catch { /* noop */ } }
  process.exit(code);
}

function run(cmd, args) {
  const child = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  children.push(child);
  child.on('exit', () => shutdown());      // if one quits, stop the other too
  child.on('error', (e) => { console.error(`[dev] failed to start ${cmd}: ${e.message}`); });
  return child;
}

process.on('SIGINT', () => shutdown());
process.on('SIGTERM', () => shutdown());

// 1) Web app — prints http://localhost:8765 (no auto-open; pass CLUELY_OPEN=1 to open).
run(process.execPath, [path.join(ROOT, 'src', 'web', 'server.js')]);

// 2) Stealth overlay (Electron, dev). `require('electron')` resolves to the binary path.
run(require('electron'), [ROOT, '--dev']);
