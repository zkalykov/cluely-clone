/* global window, document, navigator, MediaRecorder, Blob */

const el = {
  body: document.body,
  dot: document.getElementById('dot'),
  status: document.getElementById('status'),
  shots: document.getElementById('shots'),
  thinking: document.getElementById('thinking'),
  thinkingBody: document.getElementById('thinking-body'),
  scroll: document.getElementById('scroll'),
  answer: document.getElementById('answer'),
  placeholder: document.getElementById('placeholder'),
  authNote: document.getElementById('auth-note'),
  input: document.getElementById('input'),
  modeBtn: document.getElementById('mode-btn'),
  helpBtn: document.getElementById('help-btn'),
  help: document.getElementById('help'),
  helpList: document.getElementById('help-list'),
  btnCapture: document.getElementById('btn-capture'),
  btnSolve: document.getElementById('btn-solve'),
  btnType: document.getElementById('btn-type'),
  btnListen: document.getElementById('btn-listen'),
  btnClear: document.getElementById('btn-clear'),
};

// ── Minimal, safe Markdown renderer ────────────────────────────────────────
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function inlineFmt(s) {
  return s
    .replace(/`([^`]+)`/g, '<code class="inline">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}
function renderProse(text) {
  const lines = text.split('\n');
  let out = '';
  let inList = false;
  const closeList = () => { if (inList) { out += '</ul>'; inList = false; } };
  for (const line of lines) {
    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) { out += '<ul>'; inList = true; }
      out += '<li>' + inlineFmt(escapeHtml(line.replace(/^\s*[-*]\s+/, ''))) + '</li>';
      continue;
    }
    closeList();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { out += `<h${h[1].length}>` + inlineFmt(escapeHtml(h[2])) + `</h${h[1].length}>`; continue; }
    if (line.trim() === '') continue;
    out += '<p>' + inlineFmt(escapeHtml(line)) + '</p>';
  }
  closeList();
  return out;
}
function renderMarkdown(md) {
  const parts = md.split('```');
  let html = '';
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      let code = parts[i];
      let lang = '';
      const nl = code.indexOf('\n');
      if (nl >= 0) {
        const first = code.slice(0, nl).trim();
        if (/^[a-zA-Z0-9+#._-]{1,20}$/.test(first)) { lang = first; code = code.slice(nl + 1); }
      }
      code = code.replace(/\n$/, '');
      html += `<pre class="code"><div class="code-lang">${escapeHtml(lang || 'code')}</div><code>${escapeHtml(code)}</code></pre>`;
    } else {
      html += renderProse(parts[i]);
    }
  }
  return html;
}

// ── Answer state ────────────────────────────────────────────────────────────
let answerRaw = '';
let transcriptHtml = '';
let renderQueued = false;
let shotCount = 0;

function setBusy(on, statusText) {
  el.dot.classList.toggle('busy', on);
  if (statusText !== undefined) el.status.textContent = statusText;
}

function resetView() {
  answerRaw = '';
  transcriptHtml = '';
  el.answer.innerHTML = '';
  el.thinkingBody.textContent = '';
  el.thinking.classList.add('hidden');
  el.placeholder.classList.add('hidden');
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    const atBottom = el.scroll.scrollHeight - el.scroll.scrollTop - el.scroll.clientHeight < 60;
    el.answer.innerHTML = transcriptHtml + renderMarkdown(answerRaw);
    if (atBottom) el.scroll.scrollTop = el.scroll.scrollHeight;
  });
}

function updateInputPlaceholder() {
  el.input.placeholder = shotCount > 0
    ? `Ask about ${shotCount} screenshot${shotCount > 1 ? 's' : ''}…  (Enter to send)`
    : 'Ask a follow-up…  (Enter to send, Shift+Enter = newline)';
}

// ── Screenshot thumbnail strip ───────────────────────────────────────────────
function renderShots(items, count) {
  shotCount = count;
  el.shots.classList.toggle('hidden', count === 0);
  el.btnClear.classList.toggle('hidden', count === 0);
  updateInputPlaceholder();
  if (count === 0) { el.shots.innerHTML = ''; return; }

  el.shots.innerHTML = items.map((it, i) => `
    <div class="shot" data-id="${it.id}">
      <span class="shot-idx">${i + 1}</span>
      <button class="shot-rm" data-id="${it.id}" title="Remove" aria-label="Remove screenshot ${i + 1}">×</button>
      <img src="${it.thumb}" alt="screenshot ${i + 1}" draggable="false" />
    </div>`).join('');

  el.shots.querySelectorAll('.shot-rm').forEach((btn) => {
    btn.addEventListener('click', () => window.cluely.removeScreenshot(Number(btn.dataset.id)));
  });
}

// ── Handle streamed events from the main process ────────────────────────────
window.cluely.onAi((p) => {
  switch (p.kind) {
    case 'start':
      resetView();
      setBusy(true, 'Working…');
      break;
    case 'status':
      el.status.textContent = p.text || '';
      break;
    case 'queue':
      renderShots(p.items, p.count);
      break;
    case 'thinking-start':
      el.thinking.classList.remove('hidden');
      break;
    case 'thinking':
      el.thinkingBody.textContent += p.text;
      el.thinking.scrollTop = el.thinking.scrollHeight;
      break;
    case 'text-start':
      setBusy(true, 'Answering…');
      break;
    case 'text':
      answerRaw += p.text;
      scheduleRender();
      break;
    case 'transcript':
      transcriptHtml = `<div class="transcript">${escapeHtml(p.text)}</div>`;
      scheduleRender();
      break;
    case 'done':
      setBusy(false, 'Done');
      scheduleRender();
      break;
    case 'error':
      setBusy(false, 'Error');
      el.placeholder.classList.add('hidden');
      el.answer.innerHTML = transcriptHtml + `<p class="err">⚠ ${escapeHtml(p.message)}</p>`;
      break;
    case 'reset':
      resetView();
      setBusy(false, '');
      el.placeholder.classList.remove('hidden');
      break;
    case 'scroll':
      el.scroll.scrollBy({ top: p.dir === 'up' ? -220 : 220, behavior: 'smooth' });
      break;
    case 'pinned':
      applyPinned(p.pinned);
      break;
    case 'focus-input':
      // Give the renderer a tick to become the key window, then focus the box.
      setTimeout(() => { el.input.focus(); }, 30);
      break;
    case 'auth':
      if (el.authNote) {
        el.authNote.classList.toggle('ok', !!p.ok);
        el.authNote.classList.toggle('warn', !p.ok);
        el.authNote.textContent = p.ok
          ? `Signed in · ${p.label}`
          : 'Not signed in — run `claude setup-token`, then add ANTHROPIC_AUTH_TOKEN to .env (or set ANTHROPIC_API_KEY).';
      }
      break;
    case 'toggle-listen':
      toggleListening();
      break;
    default:
      break;
  }
});

// ── Interactivity (solid vs ghost) ──────────────────────────────────────────
function applyPinned(pinned) {
  el.body.classList.toggle('pinned', pinned);
  el.modeBtn.textContent = pinned ? 'PINNED' : 'AUTO';
  el.modeBtn.setAttribute('aria-pressed', String(pinned));
  el.modeBtn.title = pinned
    ? 'Pinned — always clickable. Click for AUTO (click-through).'
    : 'AUTO — click-through; hover the panel to use it. Click to pin.';
}

// AUTO mode: be clickable only while the pointer is over the panel, so clicks
// land everywhere else on the screen. (No-op while pinned — handled in main.)
const panelEl = document.getElementById('panel');
panelEl.addEventListener('mouseenter', () => window.cluely.hover(true));
panelEl.addEventListener('mouseleave', () => window.cluely.hover(false));

// ── Toolbar buttons ───────────────────────────────────────────────────────────
el.btnCapture.addEventListener('click', () => window.cluely.capture());
el.btnSolve.addEventListener('click', () => window.cluely.solve());
el.btnType.addEventListener('click', () => window.cluely.focusInput());
el.btnListen.addEventListener('click', () => toggleListening());
el.btnClear.addEventListener('click', () => window.cluely.clearQueue());

// Ensure the app is active so keystrokes actually reach the box.
el.input.addEventListener('mousedown', () => window.cluely.activate());
el.input.addEventListener('focus', () => window.cluely.activate());

el.helpBtn.addEventListener('click', async () => {
  if (el.help.classList.contains('hidden') && !el.helpList.children.length) {
    const keys = await window.cluely.getHotkeys();
    el.helpList.innerHTML = keys
      .map(([k, d]) => `<li><span class="k">${escapeHtml(k)}</span><span class="d">${escapeHtml(d)}</span></li>`)
      .join('');
  }
  const nowHidden = el.help.classList.toggle('hidden');
  el.helpBtn.setAttribute('aria-expanded', String(!nowHidden));
});

// Toggle pin/auto in main; the {kind:'pinned'} broadcast that comes back drives
// applyPinned(), so the label always reflects the real click-through state.
el.modeBtn.addEventListener('click', () => window.cluely.toggleInteract());

// ── Text input ────────────────────────────────────────────────────────────────
el.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const text = el.input.value.trim();
    if (text) {
      window.cluely.askText(text);
      el.input.value = '';
      el.input.style.height = 'auto';
    }
  } else if (e.key === 'Escape') {
    // Hand control back to the screen: blur and go click-through.
    e.preventDefault();
    el.input.blur();
    window.cluely.setInteractive(false);
  }
});
el.input.addEventListener('input', () => {
  el.input.style.height = 'auto';
  el.input.style.height = Math.min(el.input.scrollHeight, 120) + 'px';
});

// ── Audio capture (mic -> main -> Whisper) ──────────────────────────────────
let mediaRecorder = null;
let mediaStream = null;
let chunks = [];
let listening = false;

async function startListening() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    el.status.textContent = 'Mic access denied';
    return;
  }
  chunks = [];
  const opts = (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm'))
    ? { mimeType: 'audio/webm' }
    : undefined;
  mediaRecorder = new MediaRecorder(mediaStream, opts);
  mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
  mediaRecorder.onstop = async () => {
    if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
    const type = (mediaRecorder && mediaRecorder.mimeType) || 'audio/webm';
    const blob = new Blob(chunks, { type });
    if (blob.size < 1200) { el.status.textContent = 'No audio captured'; return; }
    const buf = await blob.arrayBuffer();
    window.cluely.sendAudio(buf, type);
  };
  mediaRecorder.start();
  listening = true;
  el.btnListen.classList.add('active');
  setBusy(false, 'Listening… (⌘/Ctrl+Shift+L to stop)');
  window.cluely.notifyListening(true);
}

function stopListening() {
  if (mediaRecorder && listening) {
    listening = false;
    el.btnListen.classList.remove('active');
    window.cluely.notifyListening(false);
    try { mediaRecorder.stop(); } catch { /* noop */ }
  }
}

function toggleListening() {
  if (listening) stopListening();
  else startListening();
}
