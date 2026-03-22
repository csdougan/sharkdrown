'use strict';

(function () {

// ── Constants ──────────────────────────────────────────────────────────
const LS = {
  TABS:       'sd_tabs',
  ACTIVE_TAB: 'sd_active_tab',
  THEME:      'sd_theme',
  FONT:       'sd_font',
  SPLIT:      'sd_split',
  VIEW:       'sd_view',
  FLAVOR:     'sd_flavor',
};

// ── Tab state ──────────────────────────────────────────────────────────
// Each tab: { id, name, content, isDirty, fileHandle, scrollTop }
let tabs      = [];
let activeId  = null;
let tabSeq    = 0;

function newTabId() { return `tab_${++tabSeq}`; }

function activeTab() { return tabs.find(t => t.id === activeId) || null; }

// ── DOM refs ───────────────────────────────────────────────────────────
const editorEl    = document.getElementById('editor');
const tabBarEl    = document.getElementById('tab-bar');
const statusFile  = document.getElementById('status-file');
const statusWords = document.getElementById('status-words');
const statusLines = document.getElementById('status-lines');
const statusMsg   = document.getElementById('status-msg');
const workspace   = document.getElementById('workspace');
const previewEl   = document.getElementById('preview-content');
const fontSelect  = document.getElementById('font-select');
const themeSelect = document.getElementById('theme-select');
const fontLink    = document.getElementById('preview-font-link');

// ── App-level state (not per-tab) ──────────────────────────────────────
const appState = {
  view:            'split',
  flavor:          'standard',
  previewDebounce: null,
  wysiwygDebounce: null,
};

// ── Persistence helpers ────────────────────────────────────────────────
function persist() {
  const serialisable = tabs.map(t => ({
    id:        t.id,
    name:      t.name,
    content:   t.content,
    isDirty:   t.isDirty,
    scrollTop: t.scrollTop,
  }));
  try {
    localStorage.setItem(LS.TABS,       JSON.stringify(serialisable));
    localStorage.setItem(LS.ACTIVE_TAB, activeId || '');
    localStorage.setItem(LS.VIEW,       appState.view);
    localStorage.setItem(LS.FLAVOR,     appState.flavor);
  } catch (_) {}
}

function restore() {
  try {
    const raw = localStorage.getItem(LS.TABS);
    if (raw) {
      const saved = JSON.parse(raw);
      if (Array.isArray(saved) && saved.length) {
        tabs = saved.map(t => ({ ...t, fileHandle: null }));
        tabSeq = tabs.reduce((m, t) => {
          const n = parseInt(t.id.replace('tab_', '')) || 0;
          return Math.max(m, n);
        }, 0);
        activeId = localStorage.getItem(LS.ACTIVE_TAB) || tabs[0].id;
        if (!tabs.find(t => t.id === activeId)) activeId = tabs[0].id;
        return true;
      }
    }
  } catch (_) {}
  return false;
}

// ── Utility ────────────────────────────────────────────────────────────
function showMsg(msg, isError = false) {
  statusMsg.textContent = msg;
  statusMsg.style.color = isError ? 'var(--danger)' : 'var(--accent)';
  clearTimeout(statusMsg._t);
  statusMsg._t = setTimeout(() => { statusMsg.textContent = ''; }, 3000);
}

function updateStats() {
  const text  = editorEl.value;
  const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
  const lines = text === '' ? 0 : text.split('\n').length;
  statusWords.textContent = `${words} word${words !== 1 ? 's' : ''}`;
  statusLines.textContent = `${lines} line${lines !== 1 ? 's' : ''}`;
}

function isWysiwyg() { return appState.view === 'wysiwyg'; }

// ── Turndown ───────────────────────────────────────────────────────────
const turndown = new TurndownService({
  headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced',
  fence: '```', emDelimiter: '*', strongDelimiter: '**',
});
turndown.addRule('mermaid', {
  filter: node => node.classList && node.classList.contains('mermaid'),
  replacement: (_, node) => `\n\`\`\`mermaid\n${(node.dataset.src || node.textContent).trim()}\n\`\`\`\n`,
});
turndown.addRule('fencedCode', {
  filter: node => node.nodeName === 'PRE' && node.querySelector('code'),
  replacement: (_, node) => {
    const code = node.querySelector('code');
    const lang = (code.className.match(/language-(\S+)/) || [])[1] || '';
    return `\n\`\`\`${lang}\n${code.textContent}\n\`\`\`\n`;
  },
});
turndown.addRule('taskListItem', {
  filter: node => node.nodeName === 'LI' && node.querySelector('input[type="checkbox"]'),
  replacement: (content, node) => {
    const checked = node.querySelector('input[type="checkbox"]').checked ? 'x' : ' ';
    return `- [${checked}] ${content.replace(/^\s*\[.\]\s*/, '').trim()}\n`;
  },
});

// ── Tab rendering ──────────────────────────────────────────────────────
function renderTabs() {
  tabBarEl.innerHTML = '';
  tabs.forEach(tab => {
    const el = document.createElement('button');
    el.className  = 'file-tab' + (tab.id === activeId ? ' active' : '') + (tab.isDirty ? ' dirty' : '');
    el.role       = 'tab';
    el.setAttribute('aria-selected', tab.id === activeId);
    el.setAttribute('data-tab-id', tab.id);

    const nameSpan = document.createElement('span');
    nameSpan.className   = 'tab-name';
    nameSpan.textContent = tab.name;

    const closeBtn = document.createElement('button');
    closeBtn.className        = 'tab-close';
    closeBtn.textContent      = '×';
    closeBtn.setAttribute('aria-label', `Close ${tab.name}`);
    closeBtn.addEventListener('click', e => { e.stopPropagation(); closeTab(tab.id); });

    el.appendChild(nameSpan);
    el.appendChild(closeBtn);
    el.addEventListener('click', () => switchTab(tab.id));
    tabBarEl.appendChild(el);
  });
}

// ── Tab operations ─────────────────────────────────────────────────────
function switchTab(id) {
  const prev = activeTab();
  if (prev) {
    prev.content   = editorEl.value;
    prev.scrollTop = editorEl.scrollTop;
  }
  activeId = id;
  const tab = activeTab();
  if (!tab) return;
  editorEl.value    = tab.content;
  editorEl.scrollTop = tab.scrollTop || 0;
  renderTabs();
  updateStatusFile();
  updateStats();
  schedulePreview();
  persist();
}

function createTab(name, content = '', fileHandle = null) {
  const tab = { id: newTabId(), name, content, isDirty: false, fileHandle, scrollTop: 0 };
  tabs.push(tab);
  switchTab(tab.id);
  return tab;
}

function closeTab(id) {
  const tab = tabs.find(t => t.id === id);
  if (!tab) return;
  if (tab.isDirty) {
    if (!confirm(`"${tab.name}" has unsaved changes. Close anyway?`)) return;
  }
  const idx = tabs.indexOf(tab);
  tabs.splice(idx, 1);
  if (tabs.length === 0) {
    createTab('Untitled.md', '');
    return;
  }
  if (activeId === id) {
    activeId = tabs[Math.min(idx, tabs.length - 1)].id;
    const next = activeTab();
    editorEl.value = next.content;
    editorEl.scrollTop = next.scrollTop || 0;
    updateStatusFile();
    updateStats();
    schedulePreview();
  }
  renderTabs();
  persist();
}

function markDirty() {
  const tab = activeTab();
  if (!tab || tab.isDirty) return;
  tab.isDirty = true;
  renderTabs();
  updateStatusFile();
}

function markClean() {
  const tab = activeTab();
  if (!tab) return;
  tab.isDirty = false;
  renderTabs();
  updateStatusFile();
}

function updateStatusFile() {
  const tab = activeTab();
  if (!tab) { statusFile.textContent = 'No file'; return; }
  statusFile.textContent = tab.name + (tab.isDirty ? ' •' : '');
}

// ── File System Access API ─────────────────────────────────────────────
const PICKER_OPTS = {
  types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown'], 'text/plain': ['.txt'] } }],
  excludeAcceptAllOption: false,
};

function fsaSupported() { return typeof window.showOpenFilePicker === 'function'; }

document.getElementById('btn-new').addEventListener('click', () => {
  createTab('Untitled.md', '');
  markDirty();
});

document.getElementById('btn-open').addEventListener('click', async () => {
  if (!fsaSupported()) { showMsg('File System Access API not supported', true); return; }
  let handles;
  try {
    handles = await window.showOpenFilePicker({ ...PICKER_OPTS, multiple: true });
  } catch (e) {
    if (e.name !== 'AbortError') showMsg('Could not open file picker', true);
    return;
  }
  for (const handle of handles) {
    const file = await handle.getFile();
    const text = await file.text();
    // Reuse existing tab if same name and not dirty
    const existing = tabs.find(t => t.name === file.name && !t.isDirty);
    if (existing) {
      existing.content    = text;
      existing.fileHandle = handle;
      switchTab(existing.id);
    } else {
      createTab(file.name, text, handle);
    }
  }
});

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
  if (!fsaSupported()) { showMsg('File System Access API not supported', true); return; }
  const tab = activeTab();
  if (!tab) return;
  if (tab.fileHandle) {
    try {
      const perm = await tab.fileHandle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') await tab.fileHandle.requestPermission({ mode: 'readwrite' });
      await saveToHandle(tab.fileHandle, editorEl.value);
      tab.content = editorEl.value;
      markClean();
      showMsg('Saved');
    } catch (e) {
      showMsg(`Save failed: ${e.message}`, true);
    }
  } else {
    const ok = await saveToServer(tab.name, editorEl.value);
    if (ok) { tab.content = editorEl.value; markClean(); showMsg('Saved'); }
    else showMsg('Save failed', true);
  }
  persist();
});

document.getElementById('btn-save-as').addEventListener('click', async () => {
  if (!fsaSupported()) { showMsg('File System Access API not supported', true); return; }
  const tab = activeTab();
  if (!tab) return;
  let handle;
  try {
    handle = await window.showSaveFilePicker({ ...PICKER_OPTS, suggestedName: tab.name });
  } catch (e) {
    if (e.name !== 'AbortError') showMsg('Could not open save dialog', true);
    return;
  }
  try {
    await saveToHandle(handle, editorEl.value);
    tab.fileHandle = handle;
    tab.name       = handle.name;
    tab.content    = editorEl.value;
    markClean();
    showMsg(`Saved as ${handle.name}`);
    persist();
  } catch (e) {
    showMsg(`Save failed: ${e.message}`, true);
  }
});

document.getElementById('btn-rename').addEventListener('click', async () => {
  const tab = activeTab();
  if (!tab) return;
  if (tab.fileHandle) { showMsg('Use Save As to rename host files', true); return; }
  const name = prompt('Rename to (without .md):', tab.name.replace(/\.md$/, ''));
  if (!name || !name.trim()) return;
  const newName = name.trim().replace(/\.md$/, '') + '.md';
  const res = await fetch(`/api/files/${encodeURIComponent(tab.name)}/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });
  if (res.ok) {
    tab.name = (await res.json()).name;
    markClean();
    showMsg(`Renamed to ${tab.name}`);
    persist();
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
function setView(view) {
  appState.view = view;
  workspace.className = `view-${view}`;
  document.querySelectorAll('.view-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === view);
    b.setAttribute('aria-pressed', b.dataset.view === view);
  });
  const wysiwyg = view === 'wysiwyg';
  previewEl.contentEditable = wysiwyg ? 'true' : 'false';
  previewEl.classList.toggle('wysiwyg-active', wysiwyg);
  if (view !== 'code') schedulePreview();
  persist();
}

document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => setView(btn.dataset.view));
});

// ── Flavor ─────────────────────────────────────────────────────────────
document.querySelectorAll('input[name="flavor"]').forEach(r => {
  r.addEventListener('change', () => {
    appState.flavor = r.value;
    schedulePreview();
    persist();
  });
});

// ── Live preview ───────────────────────────────────────────────────────
function schedulePreview() {
  if (appState.view === 'code') return;
  clearTimeout(appState.previewDebounce);
  appState.previewDebounce = setTimeout(renderPreview, 300);
}

async function renderPreview() {
  const res = await fetch('/api/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: editorEl.value, flavor: appState.flavor }),
  });
  const data = await res.json();
  previewEl.innerHTML = data.html;
  previewEl.querySelectorAll('.mermaid').forEach(el => {
    el.contentEditable = 'false';
    el.dataset.src = el.textContent;
    if (window.mermaid) mermaid.init(undefined, el);
  });
  if (isWysiwyg()) previewEl.contentEditable = 'true';
}

// ── WYSIWYG → Markdown sync ────────────────────────────────────────────
previewEl.addEventListener('input', () => {
  if (!isWysiwyg()) return;
  clearTimeout(appState.wysiwygDebounce);
  appState.wysiwygDebounce = setTimeout(() => {
    editorEl.value = turndown.turndown(previewEl.innerHTML);
    markDirty();
    updateStats();
    persist();
  }, 400);
});

// ── Editor input ───────────────────────────────────────────────────────
editorEl.addEventListener('input', () => {
  const tab = activeTab();
  if (tab) tab.content = editorEl.value;
  markDirty();
  updateStats();
  schedulePreview();
  persist();
});

editorEl.addEventListener('keydown', e => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = editorEl.selectionStart;
    const end   = editorEl.selectionEnd;
    editorEl.value = editorEl.value.substring(0, start) + '  ' + editorEl.value.substring(end);
    editorEl.selectionStart = editorEl.selectionEnd = start + 2;
    markDirty();
  }
});

// ── Toolbar ────────────────────────────────────────────────────────────
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
    const text = window.getSelection().toString() || url;
    document.execCommand('insertHTML', false, `<a href="${url}">${text}</a>`);
  },
  image: () => {
    const url = prompt('Image URL:');
    if (!url) return;
    const alt = prompt('Alt text:', '') || '';
    document.execCommand('insertHTML', false, `<img src="${url}" alt="${alt}" />`);
  },
  table: () => {
    document.execCommand('insertHTML', false,
      `<table><thead><tr><th>Header</th><th>Header</th></tr></thead><tbody><tr><td>Cell</td><td>Cell</td></tr></tbody></table>`);
  },
  codeblock: () => {
    const text = window.getSelection().toString() || '';
    document.execCommand('insertHTML', false, `<pre><code>${text || 'code'}</code></pre>`);
  },
  task: () => {
    document.execCommand('insertHTML', false, `<ul><li><input type="checkbox" /> Task item</li></ul>`);
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
      if (action === 'mermaid') { setView('code'); applySnippet(SNIPPETS[action]); return; }
      if (WYSIWYG_EXEC[action])  { WYSIWYG_EXEC[action]();  syncWysiwygToSource(); return; }
      if (WYSIWYG_BLOCK[action]) { WYSIWYG_BLOCK[action](); syncWysiwygToSource(); return; }
    }
    if (SNIPPETS[action]) applySnippet(SNIPPETS[action]);
  });
});

function syncWysiwygToSource() {
  editorEl.value = turndown.turndown(previewEl.innerHTML);
  markDirty();
  updateStats();
}

function applySnippet(snippet) {
  const start  = editorEl.selectionStart;
  const end    = editorEl.selectionEnd;
  const sel    = editorEl.value.substring(start, end);
  const before = editorEl.value.substring(0, start);
  const after  = editorEl.value.substring(end);
  let insert = '', cursorOffset = 0;

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

  editorEl.value = before + insert + after;
  editorEl.selectionStart = start;
  editorEl.selectionEnd   = start + cursorOffset;
  editorEl.focus();
  markDirty();
  updateStats();
  schedulePreview();
}

// ── Draggable split divider ────────────────────────────────────────────
(function initDivider() {
  const divider  = document.getElementById('pane-divider');
  const paneCode = document.getElementById('pane-code');
  let dragging = false;
  let startX, startW;

  divider.addEventListener('mousedown', e => {
    if (appState.view !== 'split') return;
    dragging = true;
    startX   = e.clientX;
    startW   = paneCode.getBoundingClientRect().width;
    divider.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const total  = workspace.getBoundingClientRect().width;
    const newW   = Math.min(Math.max(startW + (e.clientX - startX), 120), total - 124);
    const pct    = (newW / total * 100).toFixed(2);
    workspace.style.gridTemplateColumns = `${pct}% 4px 1fr`;
    try { localStorage.setItem(LS.SPLIT, pct); } catch (_) {}
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    divider.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
})();

function restoreSplit() {
  try {
    const pct = localStorage.getItem(LS.SPLIT);
    if (pct) workspace.style.gridTemplateColumns = `${pct}% 4px 1fr`;
  } catch (_) {}
}

// ── Font selection ─────────────────────────────────────────────────────
function applyFont(value) {
  const opt = fontSelect.querySelector(`option[value="${value}"]`);
  if (!opt) return;
  const url = opt.dataset.url;
  fontLink.href = `https://fonts.googleapis.com/css2?family=${url}&display=swap`;
  document.documentElement.style.setProperty('--font-preview', `'${value}', serif`);
  try { localStorage.setItem(LS.FONT, value); } catch (_) {}
}

fontSelect.addEventListener('change', () => applyFont(fontSelect.value));

// ── Theme selection ────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeSelect.value = theme;
  try { localStorage.setItem(LS.THEME, theme); } catch (_) {}
}

themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));

// ── Init ───────────────────────────────────────────────────────────────
(function init() {
  // Restore theme
  const savedTheme = localStorage.getItem(LS.THEME) || 'dark';
  applyTheme(savedTheme);

  // Restore font
  const savedFont = localStorage.getItem(LS.FONT) || 'Lora';
  fontSelect.value = savedFont;
  applyFont(savedFont);

  // Restore flavor
  const savedFlavor = localStorage.getItem(LS.FLAVOR) || 'standard';
  appState.flavor = savedFlavor;
  document.querySelector(`input[name="flavor"][value="${savedFlavor}"]`).checked = true;

  // Restore tabs
  const hadTabs = restore();
  if (!hadTabs) createTab('Untitled.md', '');

  // Render tabs and load active
  renderTabs();
  const tab = activeTab();
  if (tab) {
    editorEl.value = tab.content;
    editorEl.scrollTop = tab.scrollTop || 0;
  }

  // Restore view
  const savedView = localStorage.getItem(LS.VIEW) || 'split';
  setView(savedView);
  restoreSplit();

  updateStatusFile();
  updateStats();
})();

// ── Public API ─────────────────────────────────────────────────────────
window.SD = { editor: editorEl, schedulePreview, isWysiwyg };

})();
