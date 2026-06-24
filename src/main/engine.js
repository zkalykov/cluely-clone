// Selects how answers are generated:
//   - 'api': the Anthropic SDK (when ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN, or
//            an `ant` profile, is available)
//   - 'cli': the user's local `claude` CLI (their terminal login) — no key needed
//
// Override with CLUELY_PROVIDER=api|claude-cli. Transcription always uses the API
// engine's Whisper helper (Anthropic has no audio endpoint).
const api = require('./ai');
const cli = require('./claude-cli');
const auth = require('./auth');

let active = null;

function provider() {
  if (active) return active;
  const override = (process.env.CLUELY_PROVIDER || '').toLowerCase();
  if (override === 'api') return (active = { name: 'api', mod: api });
  if (override === 'cli' || override === 'claude-cli') return (active = { name: 'cli', mod: cli });

  // Auto: explicit credentials win; otherwise fall back to the terminal `claude`.
  if (auth.resolve()) return (active = { name: 'api', mod: api });
  if (cli.available()) return (active = { name: 'cli', mod: cli });
  return (active = { name: 'api', mod: api }); // no creds, no CLI → api throws a helpful error
}

function streamAnswer(req, handlers) {
  return provider().mod.streamAnswer(req, handlers);
}

function oneShot(opts) {
  return provider().mod.oneShot(opts);
}

function reset() {
  api.reset();
  cli.reset();
  active = null; // re-resolve next time (in case the environment changed)
}

function transcribe(buffer, mime) {
  return api.transcribe(buffer, mime);
}

function describe() {
  const p = provider();
  if (p.name === 'cli') return { ok: true, label: 'terminal claude (CLI)' };
  return auth.describe();
}

module.exports = { streamAnswer, oneShot, reset, transcribe, describe };
