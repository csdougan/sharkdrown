'use strict';

(function () {

// ── State ──────────────────────────────────────────────────────────────
const state = {
  currentFile: null,
  isDirty: false,
  flavor: 'standard',
  view: 'split',
  previewDebounce: null,
};

// ── DOM refs ───────────────────────────────────────────────────────────
const editor      = document.getElementById('editor');
const fileSelect  = document.getElementById('file-select');
const statusFile  = document.getElementById('status-file');
const statusWords = document.getElementById('status-words');
const statusLines = document.getElementById('status-lines');
const statusMsg   = document.getElementById('status-msg');
const workspace   = document.getElementById('workspace');
const previewEl   = document.getElementById('preview-content');

// ── Utility ────────────────────────────────────────────────────────────
function showMsg(msg, isError = false) {
  statusMsg.textContent = msg;
  statusMsg.style.color = isError ? 'var(--danger)' : 'var(--accent)';
  clearTimeout(statusMsg._t);
  statusMsg._t = setTimeout(() => { statusMsg.textContent = ''; }, 3000);
}

function updateStats() {
  const text = editor.value;
  const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
  const lines = text === '' ? 0 : text.split('\n').length;
  statusWords.textContent = `${words} word${words !== 1 ? 's' : ''}`;
  statusLines.textContent = `${lines} line${lines !== 1 ? 's' : ''}`;
}

function markDirty() {
  if (!state.isDirty) {
    state.isDirty = true;
    statusFile.textContent = (state.currentFile || 'Untitled') + ' •';
  }
}

function markClean() {
  state.isDirty = false;
  statusFile.textContent = state.currentFile || 'No file';
}

// ── File list ──────────────────────────────────────────────────────────
async function refreshFileList() {
  const res  = await fetch('/api/files');
  const files = await res.json();
  const current = fileSelect.value;
  fileSelect.innerHTML = '<option value="">— open file —</option>';
  files.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f;
    if (f === current) opt.selected = true;
    fileSelect.appendChild(opt);
  });
}

// ── Open ───────────────────────────────────────────────────────────────
async function openFile(filename) {
  const res  = await fetch(`/api/files/${encodeURIComponent(filename)}`);
  if (!res.ok) { showMsg('Could not open file', true); return; }
  const data = await res.json();
  editor.value = data.content;
  state.currentFile = filename;
  markClean();
  updateStats();
  schedulePreview();
}

fileSelect.addEventListener('change', () => {
  if (fileSelect.value) openFile(fileSelect.value);
});

// ── New ────────────────────────────────────────────────────────────────
document.getElementById('btn-new').addEventListener('click', () => {
  const name = prompt('New file name (without .md):');
  if (!name || !name.trim()) return;
  const filename = name.trim().replace(/\.md$/, '') + '.md';
  editor.value = '';
  state.currentFile = filename;
  markClean();
  updateStats();
  schedulePreview();
  saveFile(filename, '').then(refreshFileList);
});

// ── Save ───────────────────────────────────────────────────────────────
async function saveFile(filename, content) {
  const res = await fetch(`/api/files/${encodeURIComponent(filename)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  return res.ok;
}

document.getElementById('btn-save').addEventListener('click', async () => {
  if (!state.currentFile) {
    document.getElementById('btn-save-as').click();
    return;
  }
  const ok = await saveFile(state.currentFile, editor.value);
  if (ok) { markClean(); showMsg('Saved'); }
  else showMsg('Save failed', true);
});

document.getElementById('btn-save-as').addEventListener('click', async () => {
  const name = prompt('Save as (without .md):', state.currentFile?.replace(/\.md$/, '') || '');
  if (!name || !name.trim()) return;
  const filename = name.trim().replace(/\.md$/, '') + '.md';
  const ok = await saveFile(filename, editor.value);
  if (ok) {
    state.currentFile = filename;
    markClean();
    showMsg(`Saved as ${filename}`);
    await refreshFileList();
    fileSelect.value = filename;
  } else showMsg('Save failed', true);
});

// ── Rename ─────────────────────────────────────────────────────────────
document.getElementById('btn-rename').addEventListener('click', async () => {
  if (!state.currentFile) { showMsg('No file open', true); return; }
  const name = prompt('Rename to (without .md):', state.currentFile.replace(/\.md$/, ''));
  if (!name || !name.trim()) return;
  const res = await fetch(`/api/files/${encodeURIComponent(state.currentFile)}/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim() }),
  });
  if (res.ok) {
    const data = await res.json();
    state.currentFile = data.name;
    markClean();
    showMsg(`Renamed to ${data.name}`);
    await refreshFileList();
    fileSelect.value = data.name;
  } else showMsg('Rename failed', true);
});

// ── Ctrl+S ─────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    document.getElementById('btn-save').click();
  }
});

// ── View modes ─────────────────────────────────────────────────────────
document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    state.view = view;
    workspace.className = `view-${view}`;
    document.querySelectorAll('.view-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === view);
      b.setAttribute('aria-pressed', b.dataset.view === view);
    });
    if (view !== 'code') schedulePreview();
  });
});

// ── Flavor ─────────────────────────────────────────────────────────────
document.querySelectorAll('input[name="flavor"]').forEach(r => {
  r.addEventListener('change', () => {
    state.flavor = r.value;
    schedulePreview();
  });
});

// ── Live preview ───────────────────────────────────────────────────────
function schedulePreview() {
  if (state.view === 'code') return;
  clearTimeout(state.previewDebounce);
  state.previewDebounce = setTimeout(renderPreview, 300);
}

async function renderPreview() {
  const res = await fetch('/api/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: editor.value, flavor: state.flavor }),
  });
  const data = await res.json();
  previewEl.innerHTML = data.html;
  if (window.mermaid) {
    previewEl.querySelectorAll('.mermaid:not([data-processed])').forEach(el => {
      mermaid.init(undefined, el);
    });
  }
}

// ── Editor input ───────────────────────────────────────────────────────
editor.addEventListener('input', () => {
  markDirty();
  updateStats();
  schedulePreview();
});

editor.addEventListener('keydown', e => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = editor.selectionStart;
    const end   = editor.selectionEnd;
    editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(end);
    editor.selectionStart = editor.selectionEnd = start + 2;
    markDirty();
  }
});

// ── Toolbar actions ────────────────────────────────────────────────────
const SNIPPETS = {
  bold:       { wrap: ['**', '**'],        placeholder: 'bold text' },
  italic:     { wrap: ['*', '*'],          placeholder: 'italic text' },
  strike:     { wrap: ['~~', '~~'],        placeholder: 'strikethrough' },
  code:       { wrap: ['`', '`'],          placeholder: 'code' },
  h1:         { prefix: '# ',             placeholder: 'Heading 1' },
  h2:         { prefix: '## ',            placeholder: 'Heading 2' },
  h3:         { prefix: '### ',           placeholder: 'Heading 3' },
  ul:         { prefix: '- ',             placeholder: 'List item' },
  ol:         { prefix: '1. ',            placeholder: 'List item' },
  task:       { prefix: '- [ ] ',         placeholder: 'Task item' },
  blockquote: { prefix: '> ',             placeholder: 'Quote' },
  hr:         { block: '\n---\n' },
  link:       { template: '[{sel}](url)',  placeholder: 'link text' },
  image:      { template: '![{sel}](url)', placeholder: 'alt text' },
  table:      { block: '\n| Header | Header |\n| --- | --- |\n| Cell | Cell |\n' },
  codeblock:  { block: '\n```\n{sel}\n```\n', placeholder: '' },
  mermaid:    { block: '\n```mermaid\ngraph TD\n    A --> B\n```\n' },
};

document.querySelectorAll('.tb-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    const snippet = SNIPPETS[action];
    if (!snippet) return;
    applySnippet(snippet);
  });
});

function applySnippet(snippet) {
  const start = editor.selectionStart;
  const end   = editor.selectionEnd;
  const sel   = editor.value.substring(start, end);
  const before = editor.value.substring(0, start);
  const after  = editor.value.substring(end);

  let insert = '';
  let cursorOffset = 0;

  if (snippet.wrap) {
    const [pre, post] = snippet.wrap;
    const text = sel || snippet.placeholder;
    insert = pre + text + post;
    cursorOffset = sel ? insert.length : pre.length + text.length;
  } else if (snippet.prefix) {
    const text = sel || snippet.placeholder;
    insert = snippet.prefix + text;
    cursorOffset = insert.length;
  } else if (snippet.block) {
    insert = snippet.block.replace('{sel}', sel);
    cursorOffset = insert.length;
  } else if (snippet.template) {
    const text = sel || snippet.placeholder;
    insert = snippet.template.replace('{sel}', text);
    cursorOffset = insert.length;
  }

  editor.value = before + insert + after;
  editor.selectionStart = start;
  editor.selectionEnd   = start + cursorOffset;
  editor.focus();
  markDirty();
  updateStats();
  schedulePreview();
}

// ── Init ───────────────────────────────────────────────────────────────
refreshFileList();
updateStats();

// ── Public API for other scripts ───────────────────────────────────────
window.SD = { editor, schedulePreview };

})();
