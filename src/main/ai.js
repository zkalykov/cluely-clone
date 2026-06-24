// All model interaction lives here:
//  - streamAnswer(): streams a Claude response (vision + text + thinking)
//  - transcribe():   turns recorded audio into text via OpenAI Whisper
// Conversation state is kept in-process so follow-up questions have context.

const pkg = require('@anthropic-ai/sdk');
const Anthropic = pkg.Anthropic || pkg.default || pkg;
const auth = require('./auth');
const { SYSTEM_PROMPT } = require('./prompt');

const NO_CREDS = 'No Anthropic credentials found. Either run `claude setup-token` in your '
  + 'terminal and put the token in .env as ANTHROPIC_AUTH_TOKEN, or set ANTHROPIC_API_KEY in .env.';

let apiKeyClient = null;

function getClient() {
  const a = auth.resolve();
  if (!a) throw new Error(NO_CREDS);

  if (a.type === 'apiKey') {
    if (!apiKeyClient || apiKeyClient.__key !== a.key) {
      apiKeyClient = new Anthropic({ apiKey: a.key });
      apiKeyClient.__key = a.key;
    }
    return apiKeyClient;
  }

  // OAuth / long-lived token: Bearer auth + the OAuth beta header. Build per call
  // so a rotated token is always picked up.
  const opts = { authToken: a.token, defaultHeaders: { 'anthropic-beta': auth.OAUTH_BETA } };
  if (a.baseURL) opts.baseURL = a.baseURL;
  return new Anthropic(opts);
}

const MODEL = process.env.CLUELY_MODEL || 'claude-opus-4-8';
const EFFORT = process.env.CLUELY_EFFORT || 'medium';
const THINKING_ON = (process.env.CLUELY_THINKING || 'on').toLowerCase() !== 'off';
const MAX_TOKENS = parseInt(process.env.CLUELY_MAX_TOKENS || '8000', 10);

let messages = [];

function reset() {
  messages = [];
}

// Turn a neutral request { text, images: [base64] } into Anthropic content.
function toContent({ text, images }) {
  const imgs = (images || []).map((data) => ({
    type: 'image',
    source: { type: 'base64', media_type: 'image/png', data },
  }));
  return imgs.length ? [...imgs, { type: 'text', text }] : text;
}

// req: { text, images: [base64 PNG] }
// handlers: { onThinkingStart, onThinking, onTextStart, onText, onDone, registerAbort }
async function streamAnswer(req, handlers = {}) {
  const c = getClient();
  messages.push({ role: 'user', content: toContent(req) });

  const params = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages,
    output_config: { effort: EFFORT },
  };
  if (THINKING_ON) params.thinking = { type: 'adaptive', display: 'summarized' };

  const stream = c.messages.stream(params);
  if (handlers.registerAbort) handlers.registerAbort(() => { try { stream.abort(); } catch { /* noop */ } });

  try {
    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'thinking') handlers.onThinkingStart?.();
        else if (event.content_block.type === 'text') handlers.onTextStart?.();
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'thinking_delta') handlers.onThinking?.(event.delta.thinking);
        else if (event.delta.type === 'text_delta') handlers.onText?.(event.delta.text);
      }
    }
    const final = await stream.finalMessage();
    // Echo the full assistant content back (incl. thinking blocks) so multi-turn works.
    messages.push({ role: 'assistant', content: final.content });
    handlers.onDone?.(final.usage);
  } catch (err) {
    // On abort/error, drop the orphaned user turn so the next request starts clean.
    if (messages.length && messages[messages.length - 1].role === 'user') messages.pop();
    throw err;
  }
}

// Stateless single completion (does NOT touch the conversation history).
// Used for meeting summaries and one-off questions.
async function oneShot({ system, text, maxTokens = 2000 }) {
  const c = getClient();
  const params = {
    model: MODEL,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: text }],
    output_config: { effort: EFFORT },
  };
  if (system) params.system = system;
  if (THINKING_ON) params.thinking = { type: 'adaptive', display: 'summarized' };
  const msg = await c.messages.create(params);
  return (msg.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

// Transcribe recorded audio (a Node Buffer) via OpenAI Whisper.
async function transcribe(buffer, mime = 'audio/webm') {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('OPENAI_API_KEY is not set — required for voice transcription (Anthropic has no audio API).');
  }
  const ext = mime.includes('webm') ? 'webm' : mime.includes('ogg') ? 'ogg' : 'wav';
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mime }), `audio.${ext}`);
  form.append('model', process.env.CLUELY_STT_MODEL || 'whisper-1');

  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!resp.ok) {
    throw new Error(`Transcription failed (${resp.status}): ${await resp.text()}`);
  }
  const json = await resp.json();
  return (json.text || '').trim();
}

module.exports = { streamAnswer, oneShot, transcribe, reset, MODEL, EFFORT };
