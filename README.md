# AI Assistant

A screen- and audio-aware AI helper, powered by Claude. It comes in two forms that share one
engine: a **browser app** (`cluely-clone` — chat with screenshots, live meeting notes, history) and
a **stealth desktop overlay** that floats above everything and stays out of screen shares.

> **Use it honestly.** This is the same technology either way — but using it to deceive a
> live interviewer or proctored exam is dishonest and, if discovered, can cost you the offer
> or the job. It's built and intended for **interview & exam *practice*, coding drills,
> accessibility, and live‑meeting note‑taking / recall**, where there's nothing to hide.

## Two ways to run it

| Mode | Command | What it is |
| --- | --- | --- |
| **Browser app** (default) | `cluely-clone` (or `npm start`) → prints **http://localhost:8765** | Full app in your browser: **Ask** (chat + screenshots), **Meeting** (live transcript → Claude notes), **History**, a sidebar menu, and a logo. Does **not** auto‑open — it just shows the link; pass `--open` to open it. |
| **Stealth overlay** | `npm run overlay` | The invisible, always‑on‑top Electron overlay (screen‑share‑proof) described below. |

Both share the same Claude engine and auth (your terminal `claude` login, an API key, or a token).

### Browser app

- **Ask** — chat with Claude; attach a screenshot (📎), paste an image, drag‑drop, or grab the
  screen (📷 uses the browser's screen‑picker). Streams answers with live Markdown.
- **Meeting** — *Start listening* transcribes speech **in your browser** (Chrome/Edge Web Speech —
  no upload, no extra API key); Claude turns the running transcript into a **summary, decisions,
  and action items** (auto every ~25s or on demand). Ask follow‑up questions about the meeting.
  *(To capture the other participants on a call, route system audio to your mic, e.g. BlackHole.)*
- **History** — meetings and chats you save are kept locally in your browser; reopen or delete them.

## What the overlay does (the "Cluely" features)

1. **Invisible overlay** — a transparent, always‑on‑top window with macOS *content protection*,
   so it does **not** appear in Zoom/Meet/Teams screen shares, QuickTime, or `screencapture`.
   It's also hidden from the Dock, Mission Control, and the Cmd‑Tab switcher.
2. **Screenshot → answer** — capture your screen and stream back a complete solution from
   Claude (vision). Queue **multiple screenshots** (`⌘+H` repeatedly) — useful when a problem
   spans several scrolls or files — then solve them all at once with `⌘+Enter`.
3. **Ask about your screenshots** — instead of the generic "solve", queue screenshots and then
   **type a specific question** in the box; it's answered with all queued shots as context.
4. **Listen → answer** — capture a spoken question through the mic, transcribe it, and get a
   concise answer you can act on. *(Transcription needs an OpenAI key — see below.)*

Queued screenshots appear as a thumbnail strip; remove any with its **×**, or clear all with
`⌘+Shift+X`. They're consumed (and cleared) once a question is sent, but the conversation keeps
them in context for follow‑ups.

## Setup

Requires **Node 18+** (tested on Node 22) and **macOS** (Windows/Linux work for the overlay
and screenshot via a fallback, but stealth + audio are tuned for macOS).

```bash
cd cluely-clone
npm install
cp .env.example .env       # optional — works with your terminal `claude` login as-is
npm link                   # makes the `cluely-clone` command available globally
```

Then run it from anywhere:

```bash
cluely-clone               # start the web app — prints http://localhost:8765 (no auto-open)
cluely-clone --open        # also open it in your browser
cluely-clone --port 9000   # use a different port
npm run overlay            # the stealth desktop overlay instead
```

### Authentication — uses your terminal `claude` (no API key)

If you have the **`claude` CLI (Claude Code)** installed and logged in, do nothing: leave `.env`
blank and the app **drives `claude` directly using your terminal login**. Answers stream from the
same Claude you already use in the terminal — no key, nothing to paste. Screenshots are read by
`claude` (via a temp file + its Read tool) and conversation continuity is kept with `--resume`.

Prefer the **Anthropic API** instead? Set one of:

- `ANTHROPIC_AUTH_TOKEN` — a long-lived token from `claude setup-token` (OAuth Bearer), or
- `ANTHROPIC_API_KEY` — a classic console key (console.anthropic.com).

The overlay shows the active engine at the bottom of the start screen — e.g.
**Signed in · terminal claude (CLI)**.

**Resolution order:** `ANTHROPIC_API_KEY` → `ANTHROPIC_AUTH_TOKEN` → `ant` profile → local `claude` CLI.
Force one with `CLUELY_PROVIDER=api|claude-cli`.

| Variable               | Required | Purpose                                                            |
| ---------------------- | :------: | ------------------------------------------------------------------ |
| *(none)*               |  default | Uses your installed `claude` CLI login.                            |
| `ANTHROPIC_AUTH_TOKEN` | optional | `claude setup-token` token → Anthropic API (Bearer auth).          |
| `ANTHROPIC_API_KEY`    | optional | Console API key → Anthropic API (`x-api-key` auth).                |
| `OPENAI_API_KEY`       | optional | Only for the **Listen** feature (Whisper transcription). Screenshot‑solve and typed questions work without it — Anthropic has no audio endpoint. |

> Note: the `claude`-CLI engine spawns `claude` per question (a second or two of startup) and
> uses your Claude Code usage. The API engines are lower-latency if you have a key.

Optional tuning lives in `.env` too — model, reasoning `effort` (`low`→`max`), thinking display,
and max tokens. Defaults to `claude-opus-4-8` at `medium` effort.

### macOS permissions (one time)

On first use macOS will prompt for permissions for the app running Electron
(your Terminal in dev, or "Cluely Clone" when packaged):

- **Screen Recording** — required for `Cmd+Enter` to capture the screen.
- **Microphone** — required for the **Listen** feature.

Grant them in *System Settings → Privacy & Security*, then restart the app.

**Typing & control.** The overlay launches focused and ready — just start typing, or click the
question box (the **pencil** button / `⌘+Shift+I` also focuses it). It runs as a normal app with a
Dock icon by default so macOS reliably gives it keyboard focus; **quit any time via right‑click the
Dock icon → Quit**. To hide the Dock icon, set `CLUELY_STEALTH=1` in `.env` (only do this if typing
still works for you — a dock‑hidden app can't always take keyboard focus on macOS). The window stays
invisible to screen‑share regardless (that's content protection, not the Dock setting).

## Hotkeys (work system‑wide, even when the overlay isn't focused)

| Hotkey                          | Action                                        |
| ------------------------------- | --------------------------------------------- |
| `⌘/Ctrl + H`                    | Add a screenshot to the queue                 |
| `⌘/Ctrl + Enter`                | Solve queued screenshots (captures one if none queued) |
| `⌘/Ctrl + Shift + I`            | Type a question — make clickable & focus the box |
| `⌘/Ctrl + Shift + X`            | Clear queued screenshots                      |
| `⌘/Ctrl + Shift + L`            | Toggle listening (mic)                        |
| `⌘ + ⌃ + ← ↑ ↓ →` (Mac)         | Move the overlay (or just drag the top bar)   |
| `⌘/Ctrl + Shift + ↑ / ↓`        | Scroll the answer                             |
| `⌘/Ctrl + Shift + Space`        | Clickable ↔ click‑through                     |
| `⌘/Ctrl + \`                    | Show / hide overlay                           |
| `⌘/Ctrl + Shift + R`            | New conversation (clears context + queue)     |
| `⌘/Ctrl + Shift + Q`            | Quit                                          |
| `esc` (in the box)              | Blur and hand clicks back to the screen       |

**Two modes — controllable by mouse, no shortcuts required:**

- **PINNED (default)** — a normal floating, always‑on‑top window. **Drag the top bar to move it**,
  click the toolbar buttons, type in the box. If it's ever in your way, just drag it to a corner.
- **AUTO** — click‑through: your clicks pass to the app behind it, and it becomes clickable only
  while your pointer is **over the panel**. Best of both — it never blocks your screen, but you can
  still use it by hovering. Toggle with the **PINNED/AUTO** pill or `⌘/Ctrl + Shift + Space`.

Everything works by mouse via the toolbar (add screenshot · solve · listen · clear); the global
hotkeys are a convenience on top. If a hotkey doesn't fire, grant your terminal/Electron
**Accessibility** in *System Settings → Privacy & Security* (some macOS setups require it), or just
use the buttons.

## Capturing call audio (remote interviews/meetings)

The **Listen** feature records your default microphone. For an in‑person setting that's all you
need. To capture the *other person's* voice on a video call, route system audio into an input
device — install a loopback driver like [BlackHole](https://github.com/ExistentialAudio/BlackHole)
(or an Aggregate Device), set it as your system input, and "Listen" will transcribe the call.

## How it works

```
src/
├── main/
│   ├── index.js      app lifecycle, hotkeys ↔ actions, IPC, answer streaming
│   ├── overlay.js    transparent always‑on‑top window + stealth (content protection)
│   ├── shortcuts.js  global hotkey registration
│   ├── capture.js    full‑res screenshot (macOS `screencapture`, else desktopCapturer)
│   ├── ai.js         Claude streaming (vision + adaptive thinking) + Whisper transcription
│   └── store.js      window‑position persistence
├── preload/index.js  contextBridge API (no nodeIntegration in the renderer)
└── renderer/         the overlay UI (HTML/CSS + a tiny safe Markdown renderer)
```

The defining "invisible to screen share" trick is Electron's `win.setContentProtection(true)`
in `overlay.js` — the same OS mechanism password managers use to keep themselves out of
screenshots.

## Packaging

```bash
npm run dist     # builds a .dmg via electron-builder (see "build" in package.json)
```

## Limitations & notes

- Content protection hides the window from the capture APIs that conferencing apps use; it
  does not defeat a phone camera pointed at the screen.
- Audio transcription is request/response (record → stop → transcribe → answer), not live
  streaming captions.
- All inference runs through your own API keys and is billed to your accounts.

## License

MIT. For lawful, honest use only.
