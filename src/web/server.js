#!/usr/bin/env node
// letscheat — local web app.
// A dependency-free Node HTTP server that serves the browser UI and exposes a
// small API backed by the same Claude engine the overlay uses (terminal `claude`
// login, an API key, or a token — all auto-detected via engine.js).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');

// Load .env from the current directory and from the package root (so the
// `letscheat` command works no matter where it's launched from).
require('dotenv').config();
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const engine = require('../main/engine');
const { SYSTEM_PROMPT } = require('../main/prompt');

const args = process.argv.slice(2);
const argVal = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const PORT = parseInt(argVal('--port') || process.env.PORT || '8765', 10);
// Do NOT open a browser by default — just print the link. Opt in with --open.
const OPEN = args.includes('--open') || process.env.CLUELY_OPEN === '1';
const NO_OVERLAY = args.includes('--no-overlay') || process.env.LETSCHEAT_NO_OVERLAY === '1';
const PUBLIC = path.join(__dirname, 'public');

// Launch the desktop overlay (Electron) alongside the web app, if available.
function launchOverlay() {
  let electronPath;
  try { electronPath = require('electron'); } catch { electronPath = null; }
  if (typeof electronPath !== 'string') {
    console.log('  (desktop overlay needs Electron — running web app only)\n');
    return;
  }
  const root = path.join(__dirname, '..', '..');
  const child = spawn(electronPath, [root], { cwd: root, stdio: 'inherit' });
  child.on('error', (e) => console.log(`  (could not launch overlay: ${e.message})`));
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const MEETING_SYSTEM =
  'You are a meeting assistant. From the running transcript, produce concise, faithful notes in '
  + 'Markdown: a one- or two-sentence **Summary**, then **Key points** (bullets), **Decisions**, and '
  + '**Action items** (with owners if mentioned). Only use what the transcript supports — never invent. '
  + 'Keep it tight.';

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 60 * 1024 * 1024) { reject(new Error('Request too large')); req.destroy(); return; }
      data += c;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function parseJson(req) {
  try { return JSON.parse(await readBody(req)); } catch { return null; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const { pathname } = url;

  try {
    // ── API ────────────────────────────────────────────────────────────────
    if (pathname === '/api/status' && req.method === 'GET') {
      return sendJson(res, 200, { auth: engine.describe() });
    }

    if (pathname === '/api/reset' && req.method === 'POST') {
      engine.reset();
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/ask' && req.method === 'POST') {
      const body = await parseJson(req);
      if (!body) return sendJson(res, 400, { error: 'bad json' });
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      const sse = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      try {
        await engine.streamAnswer(
          { text: body.text || '', images: body.images || [] },
          {
            onThinkingStart: () => sse('thinkingstart', {}),
            onThinking: (t) => sse('thinking', { text: t }),
            onTextStart: () => sse('textstart', {}),
            onText: (t) => sse('delta', { text: t }),
            onDone: () => { sse('done', {}); res.end(); },
            registerAbort: (fn) => { req.on('close', () => { try { fn(); } catch { /* noop */ } }); },
          }
        );
      } catch (e) {
        sse('error', { message: String((e && e.message) || e) });
        res.end();
      }
      return undefined;
    }

    if (pathname === '/api/summarize' && req.method === 'POST') {
      const body = await parseJson(req);
      if (!body) return sendJson(res, 400, { error: 'bad json' });
      const transcript = String(body.transcript || '').slice(-24000);
      if (!transcript.trim()) return sendJson(res, 200, { summary: '' });
      const extra = body.instructions ? `\n\nFocus on: ${body.instructions}` : '';
      const summary = await engine.oneShot({
        system: MEETING_SYSTEM,
        text: `Transcript so far:\n"""${transcript}"""${extra}`,
        maxTokens: 1500,
      });
      return sendJson(res, 200, { summary });
    }

    if (pathname === '/api/ask-meeting' && req.method === 'POST') {
      const body = await parseJson(req);
      if (!body) return sendJson(res, 400, { error: 'bad json' });
      const transcript = String(body.transcript || '').slice(-24000);
      const answer = await engine.oneShot({
        system: SYSTEM_PROMPT,
        text: `Here is a meeting transcript:\n"""${transcript}"""\n\nQuestion: ${body.question || ''}\n\nAnswer using the transcript.`,
        maxTokens: 1500,
      });
      return sendJson(res, 200, { answer });
    }

    // ── Static files ─────────────────────────────────────────────────────────
    const rel = pathname === '/' ? '/index.html' : pathname;
    const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
    const filePath = path.join(PUBLIC, safe);
    if (!filePath.startsWith(PUBLIC)) return sendJson(res, 403, { error: 'forbidden' });
    return fs.readFile(filePath, (err, buf) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      res.end(buf);
    });
  } catch (e) {
    return sendJson(res, 500, { error: String((e && e.message) || e) });
  }
});

server.listen(PORT, () => {
  const link = `http://localhost:${PORT}`;
  const auth = engine.describe();
  const tty = process.stdout.isTTY;
  const c = tty
    ? { reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m', accent: '\x1b[38;5;75m', ok: '\x1b[38;5;78m', warn: '\x1b[38;5;179m', bar: '\x1b[38;5;240m' }
    : { reset: '', dim: '', bold: '', accent: '', ok: '', warn: '', bar: '' };
  const authColor = auth.ok ? c.ok : c.warn;
  const line = `${c.bar}────────────────────────────────────────────${c.reset}`;
  console.log('');
  console.log(`  ${c.accent}${c.bold}◆  letscheat${c.reset}  ${c.dim}· local server${c.reset}`);
  console.log(`  ${line}`);
  console.log(`  ${c.dim}Open${c.reset}   ${c.bold}${c.accent}${link}${c.reset}`);
  console.log(`  ${c.dim}Auth${c.reset}   ${authColor}${auth.label}${c.reset}`);
  console.log(`  ${c.dim}Stop${c.reset}   ${c.dim}Ctrl+C${c.reset}`);
  console.log('');
  if (process.platform === 'darwin' && OPEN) exec(`open ${link}`);
  if (!NO_OVERLAY) launchOverlay();
});
