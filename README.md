# AI Assistant

A screen- and audio-aware AI assistant that runs in your browser. Ask questions with
screenshots, get live meeting notes, and keep a history — powered by Claude. It runs entirely
on your machine and reuses your terminal Claude login, so there's nothing to paste and no
account to set up.

```
$ cluely-clone

  ◆  AI Assistant  · local server
  ────────────────────────────────────────────
  Open   http://localhost:8765
  Auth   terminal claude (CLI)
  Stop   Ctrl+C
```

Open the link in Chrome or Edge. That's the whole setup.

## Install

macOS or Linux, Node 18+. Not on npm yet — install straight from GitHub:

```sh
npm install -g github:zkalykov/cluely-clone
```

Then run `cluely-clone`. To try it without installing anything:

```sh
npx github:zkalykov/cluely-clone
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

## Commands & flags

| command / flag | meaning |
|---|---|
| `cluely-clone` | start the web app; print the link (no auto-open) |
| `cluely-clone --open` | also open it in your browser |
| `cluely-clone --port N` | listen on a different port (default 8765) |
| `npm run overlay` | the optional stealth desktop overlay (see below) |
| `npm run dev` | run the web app **and** the overlay together |

## The desktop overlay (optional)

A second way to use it: a transparent, always-on-top **Electron overlay** that stays out of
screen shares and recordings (macOS content protection). It answers screenshots and spoken
questions with global hotkeys, and is invisible to Zoom/Meet/Teams. Run it with `npm run overlay`
(requires the dev install below). Its controls are printed to the terminal on launch; `⌘\` hides
it from view, `⌘W` only hides (won't quit), `⌘⇧Q` quits.

## Development

```sh
git clone https://github.com/zkalykov/cluely-clone && cd cluely-clone
npm install
npm link          # makes the `cluely-clone` command available
npm start         # web app   ·   npm run dev = web + overlay
```

Dependencies are minimal: `@anthropic-ai/sdk` and `dotenv` for the web app, plus `electron`
(dev only) for the overlay. Icons are [Lucide](https://lucide.dev); the typeface is
[General Sans](https://www.fontshare.com/fonts/general-sans).

## Notes

Built with Claude. Use it honestly — it's made for interview and exam **practice**, coding
drills, accessibility, and meeting notes, not for deceiving a live interviewer or proctored
exam.

## License

MIT
