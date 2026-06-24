// Resolves Anthropic credentials, in priority order:
//   1. ANTHROPIC_API_KEY            — a console API key (x-api-key auth)
//   2. ANTHROPIC_AUTH_TOKEN         — an OAuth/long-lived token (Bearer auth)
//                                     e.g. the output of `claude setup-token`
//   3. `ant auth print-credentials` — a logged-in `ant`/Claude terminal profile
//
// OAuth tokens (cases 2 & 3) are used as `Authorization: Bearer` together with
// the `anthropic-beta: oauth-2025-04-20` header (see getClient in ai.js).
const { execFileSync } = require('child_process');

const OAUTH_BETA = 'oauth-2025-04-20';
const ANT_CACHE_MS = 5 * 60 * 1000;

let antCache = null; // { at, auth }

function nonEmpty(v) {
  return v && String(v).trim() ? String(v).trim() : null;
}

function commonPath() {
  const extra = ['/opt/homebrew/bin', '/usr/local/bin'];
  if (process.env.HOME) extra.push(`${process.env.HOME}/.local/bin`);
  return [...extra, process.env.PATH || ''].filter(Boolean).join(':');
}

// Pull a fresh token from a logged-in `ant` profile, if the CLI is installed.
function fromAnt() {
  if (antCache && Date.now() - antCache.at < ANT_CACHE_MS) return antCache.auth;
  try {
    const out = execFileSync('ant', ['auth', 'print-credentials', '--env'], {
      encoding: 'utf8',
      timeout: 8000,
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, PATH: commonPath() },
    });
    const env = {};
    for (const line of out.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
    const token = nonEmpty(env.ANTHROPIC_AUTH_TOKEN) || nonEmpty(env.ANTHROPIC_API_KEY);
    if (token) {
      const auth = { type: 'oauth', token, baseURL: nonEmpty(env.ANTHROPIC_BASE_URL) };
      antCache = { at: Date.now(), auth };
      return auth;
    }
  } catch {
    // `ant` not installed or not logged in — fall through.
  }
  return null;
}

function resolve() {
  const key = nonEmpty(process.env.ANTHROPIC_API_KEY);
  if (key) return { type: 'apiKey', key };

  const token = nonEmpty(process.env.ANTHROPIC_AUTH_TOKEN);
  if (token) return { type: 'oauth', token, baseURL: nonEmpty(process.env.ANTHROPIC_BASE_URL) };

  return fromAnt();
}

// A short, user-facing description of the active auth (for the UI), no secrets.
function describe() {
  if (nonEmpty(process.env.ANTHROPIC_API_KEY)) return { ok: true, label: 'API key' };
  if (nonEmpty(process.env.ANTHROPIC_AUTH_TOKEN)) return { ok: true, label: 'terminal token' };
  if (fromAnt()) return { ok: true, label: 'terminal login (ant)' };
  return { ok: false, label: 'not signed in' };
}

module.exports = { resolve, describe, OAUTH_BETA };
