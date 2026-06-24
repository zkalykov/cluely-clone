// Engine that drives the user's locally-installed `claude` CLI (Claude Code),
// reusing whatever they're logged into in their terminal — no API key needed.
//
// We run it headless (`-p`) with stream-json output and parse the partial
// message events into the same handler callbacks the API engine uses. Screenshots
// are written to temp PNGs and read via the Read tool. Conversation continuity is
// preserved with --resume on the captured session id.
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SYSTEM_PROMPT } = require('./prompt');

function commonPath() {
  const extra = ['/opt/homebrew/bin', '/usr/local/bin'];
  if (process.env.HOME) extra.push(`${process.env.HOME}/.local/bin`);
  return [...extra, process.env.PATH || ''].filter(Boolean).join(':');
}

let claudeBin; // memoized: string path, 'claude', or null
function findClaude() {
  if (claudeBin !== undefined) return claudeBin;
  const candidates = [];
  if (process.env.HOME) candidates.push(path.join(process.env.HOME, '.local/bin/claude'));
  candidates.push('/opt/homebrew/bin/claude', '/usr/local/bin/claude');
  for (const c of candidates) {
    try { if (fs.existsSync(c)) { claudeBin = c; return c; } } catch { /* noop */ }
  }
  try {
    execFileSync('claude', ['--version'], { stdio: 'ignore', timeout: 6000, env: { ...process.env, PATH: commonPath() } });
    claudeBin = 'claude';
  } catch {
    claudeBin = null;
  }
  return claudeBin;
}

function available() {
  return !!findClaude();
}

let lastSession = null;
function reset() {
  lastSession = null;
}

function cleanup(files) {
  for (const f of files) { try { fs.unlinkSync(f); } catch { /* noop */ } }
}

// req: { text, images: [base64 PNG] }
async function streamAnswer(req, handlers = {}) {
  const bin = findClaude();
  if (!bin) throw new Error('`claude` CLI not found. Install Claude Code, or set ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN in .env.');

  const tmpFiles = [];
  let prompt = req.text || '';
  if (req.images && req.images.length) {
    const paths = [];
    req.images.forEach((b64, i) => {
      const f = path.join(os.tmpdir(), `cluely-cli-${process.pid}-${Date.now()}-${i}.png`);
      fs.writeFileSync(f, Buffer.from(b64, 'base64'));
      tmpFiles.push(f);
      paths.push(f);
    });
    prompt += `\n\nScreenshot image file(s) to analyze:\n${paths.join('\n')}\nRead each image file, then answer.`;
  }

  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--allowedTools', 'Read',
    '--append-system-prompt', SYSTEM_PROMPT,
  ];
  if (process.env.CLUELY_CLI_MODEL) args.push('--model', process.env.CLUELY_CLI_MODEL);
  if (lastSession) args.push('--resume', lastSession);
  args.push(prompt);

  await new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      env: { ...process.env, PATH: commonPath() },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let aborted = false;
    if (handlers.registerAbort) {
      handlers.registerAbort(() => { aborted = true; try { child.kill('SIGTERM'); } catch { /* noop */ } });
    }

    let buf = '';
    let stderr = '';
    let gotText = false;
    let sessionId = null;
    let resultText = '';
    let errored = false;

    const handle = (evt) => {
      if (evt.type === 'stream_event' && evt.event) {
        const e = evt.event;
        if (e.type === 'content_block_start') {
          if (e.content_block?.type === 'thinking') handlers.onThinkingStart?.();
          else if (e.content_block?.type === 'text') handlers.onTextStart?.();
        } else if (e.type === 'content_block_delta') {
          if (e.delta?.type === 'thinking_delta') handlers.onThinking?.(e.delta.thinking || '');
          else if (e.delta?.type === 'text_delta') { gotText = true; handlers.onText?.(e.delta.text || ''); }
        }
      } else if (evt.type === 'assistant' && evt.message?.content) {
        if (evt.session_id) sessionId = evt.session_id;
        if (!gotText) {
          for (const block of evt.message.content) {
            if (block.type === 'text' && block.text) { gotText = true; handlers.onTextStart?.(); handlers.onText?.(block.text); }
          }
        }
      } else if (evt.type === 'result') {
        if (evt.session_id) sessionId = evt.session_id;
        if (typeof evt.result === 'string') resultText = evt.result;
        if (evt.is_error || (evt.subtype && evt.subtype !== 'success')) errored = true;
      } else if (evt.type === 'system' && evt.session_id) {
        sessionId = evt.session_id;
      }
    };

    child.stdout.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let evt;
        try { evt = JSON.parse(line); } catch { continue; }
        handle(evt);
      }
    });
    child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });

    child.on('error', (err) => { cleanup(tmpFiles); reject(new Error(`Failed to run claude: ${err.message}`)); });
    child.on('close', (code) => {
      if (buf.trim()) { try { handle(JSON.parse(buf.trim())); } catch { /* noop */ } }
      cleanup(tmpFiles);

      if (aborted) { reject(new Error('aborted by user')); return; }
      if (errored && !gotText) { reject(new Error(resultText || stderr.trim() || 'claude returned an error')); return; }
      if (code !== 0 && !gotText) { reject(new Error(stderr.trim() || `claude exited with code ${code}`)); return; }

      if (!gotText && resultText) { handlers.onTextStart?.(); handlers.onText?.(resultText); }
      if (sessionId) lastSession = sessionId;
      handlers.onDone?.({});
      resolve();
    });
  });
}

// Stateless single completion (no --resume) — used for summaries / one-off asks.
async function oneShot({ system, text }) {
  const bin = findClaude();
  if (!bin) throw new Error('`claude` CLI not found.');
  const args = ['-p', '--output-format', 'json'];
  if (process.env.CLUELY_CLI_MODEL) args.push('--model', process.env.CLUELY_CLI_MODEL);
  if (system) args.push('--append-system-prompt', system);
  args.push(text);
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { env: { ...process.env, PATH: commonPath() }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d.toString('utf8'); });
    child.stderr.on('data', (d) => { err += d.toString('utf8'); });
    child.on('error', (e) => reject(new Error(`Failed to run claude: ${e.message}`)));
    child.on('close', (code) => {
      try {
        resolve(((JSON.parse(out).result) || '').trim());
      } catch {
        if (code === 0) resolve(out.trim());
        else reject(new Error(err.trim() || `claude exited with code ${code}`));
      }
    });
  });
}

module.exports = { available, streamAnswer, oneShot, reset };
