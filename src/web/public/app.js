/* letscheat — browser client */

// ── Safe Markdown ────────────────────────────────────────────────────────
function esc(s) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function inlineFmt(s) {
  return s.replace(/`([^`]+)`/g, '<code class="inline">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}
function renderProse(text) {
  const lines = text.split('\n'); let out = ''; let inList = false;
  const close = () => { if (inList) { out += '</ul>'; inList = false; } };
  for (const line of lines) {
    if (/^\s*[-*]\s+/.test(line)) { if (!inList) { out += '<ul>'; inList = true; } out += '<li>' + inlineFmt(esc(line.replace(/^\s*[-*]\s+/, ''))) + '</li>'; continue; }
    close();
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { out += `<h${h[1].length}>` + inlineFmt(esc(h[2])) + `</h${h[1].length}>`; continue; }
    if (line.trim() === '') continue;
    out += '<p>' + inlineFmt(esc(line)) + '</p>';
  }
  close(); return out;
}
function md(src) {
  const parts = String(src).split('```'); let html = '';
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      let code = parts[i]; let lang = ''; const nl = code.indexOf('\n');
      if (nl >= 0) { const f = code.slice(0, nl).trim(); if (/^[a-zA-Z0-9+#._-]{1,20}$/.test(f)) { lang = f; code = code.slice(nl + 1); } }
      html += `<pre class="code"><div class="code-lang">${esc(lang || 'code')}</div><code>${esc(code.replace(/\n$/, ''))}</code></pre>`;
    } else html += renderProse(parts[i]);
  }
  return html;
}

const $ = (s) => document.querySelector(s);
const el = (t, c) => { const e = document.createElement(t); if (c) e.className = c; return e; };

const SVG = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const ICON = {
  bot: `<svg ${SVG}><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>`,
  user: `<svg ${SVG}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
};
const EMPTY_ASK = `<div class="empty"><div class="empty-mark"><svg ${SVG} width="22" height="22">`
  + '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg></div>'
  + '<h2>How can I help?</h2><p>Ask anything, paste or attach a screenshot, or capture your screen.</p></div>';
const TYPING = '<span class="typing"><i></i><i></i><i></i></span>';

// Add a "Copy" button to every code block inside `root`.
function enhanceCode(root) {
  root.querySelectorAll('pre.code').forEach((pre) => {
    if (pre.querySelector('.copy-btn')) return;
    const code = pre.querySelector('code');
    if (!code) return;
    const btn = el('button', 'copy-btn'); btn.type = 'button'; btn.textContent = 'Copy';
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code.textContent);
        btn.textContent = 'Copied'; btn.classList.add('done');
        setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('done'); }, 1400);
      } catch { btn.textContent = 'Copy failed'; }
    });
    pre.appendChild(btn);
  });
}

// ── Navigation ───────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((x) => x.classList.remove('active'));
    document.querySelectorAll('.view').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    $('#view-' + b.dataset.view).classList.add('active');
    if (b.dataset.view === 'history') renderHistory();
  });
});

// ── Status / auth ────────────────────────────────────────────────────────
fetch('/api/status').then((r) => r.json()).then((s) => {
  const n = $('#auth-note'); const a = s.auth || {};
  n.classList.toggle('ok', !!a.ok); n.classList.toggle('warn', !a.ok);
  n.textContent = a.ok ? `Signed in · ${a.label}` : 'Not signed in — see README';
}).catch(() => {});

$('#new-chat').addEventListener('click', async () => {
  await fetch('/api/reset', { method: 'POST' });
  $('#ask-thread').innerHTML = EMPTY_ASK;
});

// ── SSE stream reader ──────────────────────────────────────────────────────
async function streamAsk(payload, onEvent) {
  const resp = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const reader = resp.body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx); buf = buf.slice(idx + 2);
      let event = 'message'; let data = '';
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (data) { let parsed = {}; try { parsed = JSON.parse(data); } catch { /* noop */ } onEvent(event, parsed); }
    }
  }
}

// ── Images ─────────────────────────────────────────────────────────────────
function fileToPng(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = el('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0); URL.revokeObjectURL(url);
      const d = c.toDataURL('image/png'); resolve({ dataUrl: d, b64: d.split(',')[1] });
    };
    img.onerror = reject; img.src = url;
  });
}
async function captureScreen() {
  let stream;
  try { stream = await navigator.mediaDevices.getDisplayMedia({ video: true }); } catch { return null; }
  const video = el('video'); video.srcObject = stream; await video.play();
  await new Promise((r) => setTimeout(r, 280));
  const c = el('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
  c.getContext('2d').drawImage(video, 0, 0);
  stream.getTracks().forEach((t) => t.stop());
  const d = c.toDataURL('image/png'); return { dataUrl: d, b64: d.split(',')[1] };
}

// ── Ask view ───────────────────────────────────────────────────────────────
const askThread = $('#ask-thread');
const askInput = $('#ask-input');
const attachWrap = $('#ask-attachments');
let attachments = [];
let asking = false;

function renderAttachments() {
  attachWrap.classList.toggle('hidden', attachments.length === 0);
  attachWrap.innerHTML = '';
  attachments.forEach((a, i) => {
    const w = el('div', 'att'); const img = el('img'); img.src = a.dataUrl;
    const x = el('button', 'x'); x.textContent = '×'; x.onclick = () => { attachments.splice(i, 1); renderAttachments(); };
    w.append(img, x); attachWrap.append(w);
  });
}
function addImage(o) { if (o) { attachments.push(o); renderAttachments(); } }

$('#ask-attach').addEventListener('click', () => $('#ask-file').click());
$('#ask-file').addEventListener('change', async (e) => {
  for (const f of e.target.files) { try { addImage(await fileToPng(f)); } catch { /* noop */ } }
  e.target.value = '';
});
$('#ask-capture').addEventListener('click', async () => { addImage(await captureScreen()); });
document.addEventListener('paste', async (e) => {
  if (!$('#view-ask').classList.contains('active')) return;
  for (const it of (e.clipboardData?.items || [])) {
    if (it.type.startsWith('image/')) { try { addImage(await fileToPng(it.getAsFile())); } catch { /* noop */ } }
  }
});
['dragover', 'drop'].forEach((ev) => askThread.addEventListener(ev, (e) => e.preventDefault()));
askThread.addEventListener('drop', async (e) => {
  for (const f of (e.dataTransfer?.files || [])) if (f.type.startsWith('image/')) addImage(await fileToPng(f));
});

function autoGrow(t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 160) + 'px'; }
askInput.addEventListener('input', () => autoGrow(askInput));
askInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#ask-form').requestSubmit(); } });

$('#ask-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = askInput.value.trim();
  if ((!text && attachments.length === 0) || asking) return;
  asking = true; $('#ask-send').disabled = true;

  if (askThread.querySelector('.empty')) askThread.innerHTML = '';
  // user message
  const u = el('div', 'msg user');
  u.innerHTML = `<div class="avatar user">${ICON.user}</div><div class="body"><div class="role">You</div><div class="bubble">${esc(text || '(image)')}</div></div>`;
  if (attachments.length) { const th = el('div', 'thumbs'); attachments.forEach((a) => { const im = el('img'); im.src = a.dataUrl; th.append(im); }); u.querySelector('.body').append(th); }
  askThread.append(u);
  // assistant message
  const a = el('div', 'msg assistant');
  a.innerHTML = `<div class="avatar">${ICON.bot}</div><div class="body"><div class="role">letscheat</div><div class="thinking hidden"></div><div class="md"></div></div>`;
  askThread.append(a); askThread.scrollTop = askThread.scrollHeight;
  const thinkEl = a.querySelector('.thinking'); const mdEl = a.querySelector('.md'); mdEl.innerHTML = TYPING;

  const images = attachments.map((x) => x.b64);
  askInput.value = ''; autoGrow(askInput); attachments = []; renderAttachments();

  let raw = ''; let think = '';
  try {
    await streamAsk({ text, images }, (event, data) => {
      if (event === 'thinking') { think += data.text || ''; thinkEl.classList.remove('hidden'); thinkEl.textContent = think; }
      else if (event === 'delta') { raw += data.text || ''; mdEl.innerHTML = md(raw); askThread.scrollTop = askThread.scrollHeight; }
      else if (event === 'error') { mdEl.innerHTML = `<p class="err">⚠ ${esc(data.message || 'error')}</p>`; }
    });
  } catch (err) { mdEl.innerHTML = `<p class="err">⚠ ${esc(String(err))}</p>`; }
  if (raw) { mdEl.innerHTML = md(raw); enhanceCode(mdEl); saveHistory({ type: 'ask', title: text || 'Image question', body: raw }); }
  asking = false; $('#ask-send').disabled = false;
});

// ── Meeting view ─────────────────────────────────────────────────────────────
const tEl = $('#mt-transcript'); const sEl = $('#mt-summary');
let rec = null; let listening = false; let finalText = ''; let interim = ''; let autoTimer = null; let lastSummarizedLen = 0; let lastSummary = '';

function renderTranscript() {
  if (!finalText && !interim) { tEl.innerHTML = '<div class="empty">Press “Start listening”. Speech is transcribed by your browser — no upload, no API key.</div>'; return; }
  tEl.innerHTML = esc(finalText) + (interim ? `<span class="interim">${esc(interim)}</span>` : '');
  tEl.scrollTop = tEl.scrollHeight;
}
function mtStatus(s) { $('#mt-status').textContent = s; }

function startRec() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { mtStatus('Speech recognition needs Chrome/Edge.'); return; }
  rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = 'en-US';
  rec.onresult = (e) => {
    interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript.trim() + ' '; else interim += r[0].transcript;
    }
    renderTranscript();
  };
  rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') mtStatus('Microphone permission denied.'); };
  rec.onend = () => { if (listening) { try { rec.start(); } catch { /* noop */ } } };
  try { rec.start(); } catch { /* noop */ }
  listening = true;
  $('#mt-toggle').textContent = '■ Stop listening'; $('#mt-toggle').classList.add('rec');
  mtStatus('Listening…');
  autoTimer = setInterval(() => { if ($('#mt-auto').checked && finalText.length - lastSummarizedLen > 350) summarize(); }, 25000);
}
function stopRec() {
  listening = false; try { rec && rec.stop(); } catch { /* noop */ }
  clearInterval(autoTimer); autoTimer = null;
  $('#mt-toggle').textContent = '● Start listening'; $('#mt-toggle').classList.remove('rec');
  mtStatus('Stopped.');
}
$('#mt-toggle').addEventListener('click', () => (listening ? stopRec() : startRec()));

async function summarize() {
  if (!finalText.trim()) return;
  lastSummarizedLen = finalText.length;
  mtStatus('Summarizing…');
  try {
    const r = await fetch('/api/summarize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript: finalText }) });
    const j = await r.json();
    if (j.summary) { lastSummary = j.summary; sEl.innerHTML = `<div class="md">${md(j.summary)}</div>`; enhanceCode(sEl); }
    mtStatus(listening ? 'Listening…' : 'Stopped.');
  } catch { mtStatus('Summarize failed.'); }
}
$('#mt-summarize').addEventListener('click', summarize);
$('#mt-clear').addEventListener('click', () => {
  finalText = ''; interim = ''; lastSummarizedLen = 0; lastSummary = '';
  renderTranscript(); sEl.innerHTML = '<div class="empty">Summaries appear here.</div>';
});
$('#mt-save').addEventListener('click', () => {
  if (!finalText.trim()) { mtStatus('Nothing to save.'); return; }
  const title = 'Meeting · ' + new Date().toLocaleString();
  saveHistory({ type: 'meeting', title, transcript: finalText, body: lastSummary });
  mtStatus('Saved to history.');
});

const mtAsk = $('#mt-ask');
mtAsk.addEventListener('input', () => autoGrow(mtAsk));
mtAsk.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#mt-ask-form').requestSubmit(); } });
$('#mt-ask-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = mtAsk.value.trim(); if (!q) return;
  mtAsk.value = ''; autoGrow(mtAsk);
  const block = el('div', 'md'); block.style.marginTop = '14px';
  block.innerHTML = `<p><strong>Q:</strong> ${esc(q)}</p><p class="muted">…</p>`;
  sEl.append(block); sEl.scrollTop = sEl.scrollHeight;
  try {
    const r = await fetch('/api/ask-meeting', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript: finalText, question: q }) });
    const j = await r.json();
    block.innerHTML = `<p><strong>Q:</strong> ${esc(q)}</p>` + md(j.answer || j.error || '(no answer)'); enhanceCode(block);
  } catch (err) { block.innerHTML = `<p class="err">⚠ ${esc(String(err))}</p>`; }
  sEl.scrollTop = sEl.scrollHeight;
});

// ── History (localStorage) ──────────────────────────────────────────────────
const HKEY = 'letscheat-history-v1';
function loadHistory() { try { return JSON.parse(localStorage.getItem(HKEY)) || []; } catch { return []; } }
function saveHistory(item) {
  const h = loadHistory();
  h.unshift({ id: String(Date.now()) + Math.random().toString(36).slice(2, 6), createdAt: Date.now(), ...item });
  localStorage.setItem(HKEY, JSON.stringify(h.slice(0, 300)));
}
function deleteHistory(id) { localStorage.setItem(HKEY, JSON.stringify(loadHistory().filter((x) => x.id !== id))); }

const histList = $('#history-list');
function renderHistory() {
  const h = loadHistory();
  if (!h.length) { histList.innerHTML = '<div class="empty">No saved chats or meetings yet.</div>'; return; }
  histList.innerHTML = '';
  h.forEach((item) => {
    const row = el('div', 'hist');
    const date = new Date(item.createdAt).toLocaleString();
    row.innerHTML = `<span class="tag">${esc(item.type)}</span><span class="h-title">${esc(item.title || '(untitled)')}</span><span class="h-date">${esc(date)}</span><button class="h-del" title="Delete">×</button>`;
    row.querySelector('.h-del').addEventListener('click', (e) => { e.stopPropagation(); deleteHistory(item.id); renderHistory(); });
    row.addEventListener('click', () => openHistory(item));
    histList.append(row);
  });
}
function openHistory(item) {
  const back = el('button', 'btn'); back.textContent = '← Back'; back.onclick = renderHistory;
  histList.innerHTML = '';
  histList.append(back);
  const head = el('div', 'msg'); head.innerHTML = `<div class="role">${esc(item.type)} · ${esc(new Date(item.createdAt).toLocaleString())}</div><h2 style="margin:6px 0">${esc(item.title || '')}</h2>`;
  histList.append(head);
  if (item.transcript) {
    const t = el('div', 'md'); t.innerHTML = '<h3>Transcript</h3>' + `<p>${esc(item.transcript)}</p>`; histList.append(t);
  }
  if (item.body) { const b = el('div', 'md'); b.innerHTML = (item.type === 'meeting' ? '<h3>Notes</h3>' : '') + md(item.body); histList.append(b); enhanceCode(b); }
}
