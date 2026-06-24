// Tiny JSON settings store (window position, etc.) in the OS userData dir.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const FILE = path.join(app.getPath('userData'), 'cluely-settings.json');
const DEFAULTS = { x: undefined, y: undefined };

function read() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

function write(patch) {
  const next = { ...read(), ...patch };
  try {
    fs.writeFileSync(FILE, JSON.stringify(next, null, 2));
  } catch {
    /* best effort */
  }
  return next;
}

module.exports = { read, write };
