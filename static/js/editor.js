'use strict';

(function () {

// ── State ──────────────────────────────────────────────────────────────
const state = {
  currentFile:     null,
  fileHandle:      null,
  isDirty:         false,
  flavor:          'standard',
  view:            'split',
  previewDebounce: null,
  wysiwygDebounce: null,
};

// ── DOM refs ───────────────────────────────────────────────────────────
const editor      = document.getElementById('editor');
const statusFile  = document.getElementById('status-file');
const statusWords = document.getElementById('status-words');
const statusLines = document.getElementById('status-lines');
const statusMsg   = document.getElementById('status-msg');
const workspace   = document.getElementById('workspace');
const previewEl   = document.getElementById('preview-content');

// ── Turndown (HTML → Markdown) ─────────────────────────────────────────
const turndown = new TurndownService({
  headingStyle:   'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  fence:          '```',
  emDelimiter:    '*',
  strongDelimiter: '**',
});

// Preserve mermaid blocks as fenced code
turndown.addRule('mermaid', {
  filter: node => node.classList && node.classList.contains('mermaid'),
  replacement: (content, node) => {
    const src = node.dataset.src || node.textContent;
    return `\n\`\`\`mermaid\n${src.trim()}\n\`\`\`\n`;
  },
});

// Preserve generic fenced code blocks
turndown.addRule('fencedCode', {
  filter: node => node.nodeName === 'PRE' && node.querySelector('code'),
  replacement: (content, node) => {
    const code = node.querySelector('code');
    const lang = (code.className.match(/language-(\S+)/) || [])[1] || '';
    return `\n\`\`\`${lang}\n${code.textContent}\n\`\`\`\n`;
  },
});

// Task list items
turndown.addRule('taskListItem', {
  filter: node => {
    return node.nodeName === 'LI' &&
      node.querySelector('input[type="checkbox"]');
  },
  replacement: (content, node) => {
    const cb = node.querySelector('input[type="checkbox"]');
    const checked = cb.checked ? 'x' : ' ';
    const text = content.replace(/^\s*\[.\]\s*/, '').trim();
    return `- [${checked}] ${text}\n`;
  },
});

function htmlToMarkdown(html) {
  return turndown.turndown(html);
}

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

function isWysiwyg() {
  return state.view === 'wysiwyg';
}

// ── File System Access API ─────────────────────────────────────────────
const PICKER_OPTS = {
  types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'], 'text/plain': ['.txt'] } }],
  excludeAcceptAllOption: false,
};

function fsaSupported() {
  return typeof window.showOpenFilePicker === 'function';
}

function loadContent(content, filename, handle = null) {
  editor.value = content;
  state.currentFile = filename;
  state.fileHandle  = handle;
  markClean();
  updateStats();
  schedulePreview();
}

// ── Open ───────────────────────────────────────────────────────────────
document.getElementById('btn-new').addEventListener('click', () => {
  loadContent('', 'Untitled.md', null);
  markDirty();
});

document.getElementById('btn-open').addEventListener('click', async () => {
  if (!fsaSupported()) { showMsg('File System Access API not supported in this browser', true); return; }
  let handles;
  try {
    handles = await window.showOpenFilePicker({ ...PICKER_OPTS, multiple: false });
  } catch (e) {
    if (e.name !== 'AbortError') showMsg('Could not open file picker', true);
    return;
  }
  const handle = handles[0];
  const file   = await handle.getFile();
  const text   = await file.text();
  loadContent(text, file.name, handle);
});

// ── Save ───────────────────────────────────────────────────────────────
async function saveToHandle(handle, content) {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

async function saveToServer(filename, content) {
  const res = await fetch(`/api/files/${encodeURIComponent(filename)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  return res.ok;
}

document.getElementById('btn-save').addEventListener('click', async () => {
  if (!fsaSupported()) { showMsg('File System Access API not supported in this browser', true); return; }
  if (state.fileHandle) {
    try {
      await saveToHandle(state.fileHandle, editor.value);
      markClean();
      showMsg('Saved');
    } catch (e) {
      if (e.name === 'NotAllowedError') {
        // Permission may need re-granting (e.g. after page reload)
        const perm = await state.fileHandle.requestPermission({ mode: 'readwrite' });
        if (perm === 'granted') {
          await saveToHandle(state.fileHandle, editor.value);
          markClean();
          showMsg('Saved');
        } else {
          showMsg('Write permission denied', true);
        }
      } else {
        showMsg(`Save failed: ${e.message}`, true);
      }
    }
  } else if (state.currentFile && !state.fileHandle) {
    // Internal server file
    const ok = await saveToServer(state.currentFile, editor.value);
    if (ok) { markClean(); showMsg('Saved'); }
    else showMsg('Save failed', true);
  } else {
    document.getElementById('btn-save-as').click();
  }
});

document.getElementById('btn-save-as').addEventListener('click', async () => {
  if (!fsaSupported()) { showMsg('File System Access API not supported in this browser', true); return; }
  const suggested = state.currentFile || 'untitled.md';
  let handle;
  try {
    handle = await window.showSaveFilePicker({
      ...PICKER_OPTS,
      suggestedName: suggested,
    });
  } catch (e) {
    if (e.name !== 'AbortError') showMsg('Could not open save dialog', true);
    return;
  }
  try {
    await saveToHandle(handle, editor.value);
    state.fileHandle  = handle;
    state.currentFile = handle.name;
    markClean();
    showMsg(`Saved as ${handle.name}`);
  } catch (e) {
    showMsg(`Save failed: ${e.message}`, true);
  }
});

// ── Rename ─────────────────────────────────────────────────────────────
document.getElementById('btn-rename').addEventListener('click', async () => {
  if (!state.currentFile || state.fileHandle) {
    showMsg('Rename only works for internal files — use Save As for host files', true);
    return;
  }
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

    const wysiwyg = view === 'wysiwyg';
    previewEl.contentEditable = wysiwyg ? 'true' : 'false';
    previewEl.classList.toggle('wysiwyg-active', wysiwyg);

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

  // Lock mermaid blocks — store original source for round-trip
  previewEl.querySelectorAll('.mermaid').forEach(el => {
    el.contentEditable = 'false';
    el.dataset.src = el.textContent;
    if (window.mermaid) mermaid.init(undefined, el);
  });

  // Re-apply contenteditable if currently in wysiwyg mode
  if (isWysiwyg()) {
    previewEl.contentEditable = 'true';
  }
}

// ── WYSIWYG → Markdown sync ────────────────────────────────────────────
previewEl.addEventListener('input', () => {
  if (!isWysiwyg()) return;
  clearTimeout(state.wysiwygDebounce);
  state.wysiwygDebounce = setTimeout(() => {
    const md = htmlToMarkdown(previewEl.innerHTML);
    editor.value = md;
    markDirty();
    updateStats();
  }, 400);
});

// ── Editor (textarea) input ────────────────────────────────────────────
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

// ── Toolbar ────────────────────────────────────────────────────────────
// In WYSIWYG mode, inline formatting uses execCommand.
// Block-level elements are inserted as HTML at the cursor.
const WYSIWYG_EXEC = {
  bold:   () => document.execCommand('bold'),
  italic: () => document.execCommand('italic'),
  strike: () => document.execCommand('strikeThrough'),
};

const WYSIWYG_BLOCK = {
  h1:         () => document.execCommand('formatBlock', false, 'h1'),
  h2:         () => document.execCommand('formatBlock', false, 'h2'),
  h3:         () => document.execCommand('formatBlock', false, 'h3'),
  blockquote: () => document.execCommand('formatBlock', false, 'blockquote'),
  ul:         () => document.execCommand('insertUnorderedList'),
  ol:         () => document.execCommand('insertOrderedList'),
  hr:         () => document.execCommand('insertHorizontalRule'),
  code: () => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const code = document.createElement('code');
    code.textContent = sel.toString() || 'code';
    range.deleteContents();
    range.insertNode(code);
    sel.collapseToEnd();
  },
  link: () => {
    const url = prompt('URL:');
    if (!url) return;
    const sel = window.getSelection();
    const text = sel.toString() || url;
    document.execCommand('insertHTML', false,
      `<a href="${url}">${text}</a>`);
  },
  image: () => {
    const url = prompt('Image URL:');
    if (!url) return;
    const alt = prompt('Alt text:', '');
    document.execCommand('insertHTML', false,
      `<img src="${url}" alt="${alt || ''}" />`);
  },
  table: () => {
    document.execCommand('insertHTML', false,
      `<table><thead><tr><th>Header</th><th>Header</th></tr></thead>` +
      `<tbody><tr><td>Cell</td><td>Cell</td></tr></tbody></table>`);
  },
  codeblock: () => {
    const sel = window.getSelection();
    const text = sel.toString() || '';
    document.execCommand('insertHTML', false,
      `<pre><code>${text || 'code'}</code></pre>`);
  },
  task: () => {
    document.execCommand('insertHTML', false,
      `<ul><li><input type="checkbox" /> Task item</li></ul>`);
  },
};

const SNIPPETS = {
  bold:       { wrap: ['**', '**'],         placeholder: 'bold text' },
  italic:     { wrap: ['*', '*'],           placeholder: 'italic text' },
  strike:     { wrap: ['~~', '~~'],         placeholder: 'strikethrough' },
  code:       { wrap: ['`', '`'],           placeholder: 'code' },
  h1:         { prefix: '# ',              placeholder: 'Heading 1' },
  h2:         { prefix: '## ',             placeholder: 'Heading 2' },
  h3:         { prefix: '### ',            placeholder: 'Heading 3' },
  ul:         { prefix: '- ',              placeholder: 'List item' },
  ol:         { prefix: '1. ',             placeholder: 'List item' },
  task:       { prefix: '- [ ] ',          placeholder: 'Task item' },
  blockquote: { prefix: '> ',              placeholder: 'Quote' },
  hr:         { block: '\n---\n' },
  link:       { template: '[{sel}](url)',   placeholder: 'link text' },
  image:      { template: '![{sel}](url)', placeholder: 'alt text' },
  table:      { block: '\n| Header | Header |\n| --- | --- |\n| Cell | Cell |\n' },
  codeblock:  { block: '\n```\n{sel}\n```\n', placeholder: '' },
  mermaid:    { block: '\n```mermaid\ngraph TD\n    A --> B\n```\n' },
};

document.querySelectorAll('.tb-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    if (!action) return;

    if (isWysiwyg()) {
      // Mermaid not editable in WYSIWYG — insert into source only
      if (action === 'mermaid') {
        state.view = 'code';
        workspace.className = 'view-code';
        document.querySelectorAll('.view-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.view === 'code');
          b.setAttribute('aria-pressed', b.dataset.view === 'code');
        });
        previewEl.contentEditable = 'false';
        previewEl.classList.remove('wysiwyg-active');
        applySnippet(SNIPPETS[action]);
        return;
      }
      if (WYSIWYG_EXEC[action]) { WYSIWYG_EXEC[action](); syncWysiwygToSource(); return; }
      if (WYSIWYG_BLOCK[action]) { WYSIWYG_BLOCK[action](); syncWysiwygToSource(); return; }
    }

    const snippet = SNIPPETS[action];
    if (snippet) applySnippet(snippet);
  });
});

function syncWysiwygToSource() {
  const md = htmlToMarkdown(previewEl.innerHTML);
  editor.value = md;
  markDirty();
  updateStats();
}

function applySnippet(snippet) {
  const start  = editor.selectionStart;
  const end    = editor.selectionEnd;
  const sel    = editor.value.substring(start, end);
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
updateStats();

// ── Public API ─────────────────────────────────────────────────────────
window.SD = { editor, schedulePreview, isWysiwyg };

})();
