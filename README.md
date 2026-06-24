# letscheat

A **1‑to‑1 clone of [Cluely](https://cluely.com) and Interview Hacker** — a screen- and
audio-aware AI assistant. It pops up an invisible, always‑on‑top desktop overlay (kept out of
screen shares) **and** a browser app: ask questions about what's on your screen, get real‑time
answers, live meeting notes, and history. Powered by Claude, it runs entirely on your machine and
reuses your terminal Claude login, so there's nothing to paste and no account to set up.

```
$ letscheat

  ◆  letscheat  · local server
  ────────────────────────────────────────────
  Open   http://localhost:8765
  Auth   terminal claude (CLI)
  Stop   Ctrl+C
```

Open the link in Chrome or Edge. That's the whole setup.

## Install

macOS or Linux, Node 18+. Not on npm yet, so install straight from GitHub:

```sh
npm install -g github:zkalykov/letscheat
```

Then run `letscheat`. To try it without installing anything:

```sh
npx github:zkalykov/letscheat
```

It prints a `http://localhost:8765` link and waits — it does **not** open a browser. Pass
`--open` if you want it to.

## What you get

**Ask** — chat with Claude. Attach a screenshot, paste an image, drag one in, or grab your
screen with the browser's picker. Answers stream in with formatted Markdown and copy-able code
blocks.

**Meeting** — press *Start listening* and your speech is transcribed **in the browser** (no
upload, no extra API key). Claude turns the running transcript into a summary, decisions, and
action items — automatically or on demand — and you can ask follow-up questions about the
meeting. To capture everyone on a call, route your system audio into the mic with a loopback
device such as [BlackHole](https://github.com/ExistentialAudio/BlackHole).

**History** — meetings and chats you save are kept locally in your browser; reopen or delete
them any time.

## Authentication

It uses one credential, resolved in this order:

1. `ANTHROPIC_API_KEY` — a console API key
2. `ANTHROPIC_AUTH_TOKEN` — a long-lived token from `claude setup-token`
3. your logged-in **terminal `claude`** (Claude Code) — used automatically if the above are unset

So if you already use Claude in your terminal, you don't need to do anything. Otherwise put a
key or token in a `.env` file (see `.env.example`). The sidebar shows which one is active.

## macOS permissions

The web app needs nothing special — the browser prompts for the **microphone** the first time
you start a meeting, and for screen access when you use *capture screen*. Use **Chrome or Edge**
for the Meeting tab (Safari and Firefox lack the in-browser speech API).

## Flags

| flag | meaning |
|---|---|
| `--open` | also open the link in your browser |
| `--port N` | listen on this port (default 8765) |

## Development

```sh
git clone https://github.com/zkalykov/letscheat && cd letscheat
npm install
npm link          # makes the `letscheat` command available
letscheat         # or: npm start
```

There's also an optional stealth desktop overlay (a transparent, always-on-top Electron window
that stays out of screen shares) — run it with `npm run overlay`, or both together with
`npm run dev`. Dependencies are minimal: `@anthropic-ai/sdk` and `dotenv`, plus `electron`
(dev only) for the overlay. Icons are [Lucide](https://lucide.dev); the typeface is
[General Sans](https://www.fontshare.com/fonts/general-sans).

## Notes

Built with Claude. Use it honestly — it's meant for interview and exam **practice**, coding
drills, accessibility, and meeting notes.

## License

MIT
