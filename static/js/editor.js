'use strict';

(function () {

// ── Constants ──────────────────────────────────────────────────────────
const LS = {
  TABS: 'sd_tabs', ACTIVE_TAB: 'sd_active_tab',
  THEME: 'sd_theme', FONT: 'sd_font',
  SPLIT: 'sd_split',
  VIEW: 'sd_view', FORMAT: 'sd_format',
  LINE_NUMS: 'sd_line_nums',
};

// ── Tab state ──────────────────────────────────────────────────────────
// Each tab: { id, name, content, isDirty, fileHandle, scrollTop, format }
// Mermaid tabs also have: { type:'mermaid', diagramSrc }
// type defaults to 'markdown' when absent
let tabs     = [];
let activeId = null;
let tabSeq   = 0;

function newTabId() { return `tab_${++tabSeq}`; }
function activeTab() { return tabs.find(t => t.id === activeId) || null; }

// ── DOM refs ───────────────────────────────────────────────────────────
const editorEl       = document.getElementById('editor');
const editorWrap     = document.getElementById('editor-wrap');
const tabBarEl       = document.getElementById('tab-bar');
const statusFile     = document.getElementById('status-file');
const statusWords    = document.getElementById('status-words');
const statusLines    = document.getElementById('status-lines');
const statusCursor   = document.getElementById('status-cursor');
const statusMsg      = document.getElementById('status-msg');
const workspace      = document.getElementById('workspace');
const previewEl      = document.getElementById('preview-content');
const fontSelect     = document.getElementById('font-select');
const themeSelect    = document.getElementById('theme-select');
const formatSelect   = document.getElementById('format-select');
const fontLink       = document.getElementById('preview-font-link');
const lineNumsEl     = document.getElementById('line-numbers');
const btnLineNums    = document.getElementById('btn-line-nums');
const emptyState     = document.getElementById('empty-state');
const mermaidPane    = document.getElementById('mermaid-pane');
const editorInner    = document.getElementById('editor-inner');

// ── App-level state ────────────────────────────────────────────────────
const appState = {
  view:            'split',
  format:          'standard',
  lineNums:        false,
  previewDebounce: null,
  wysiwygDebounce: null,
  hlDebounce:      null,
  hlRaf:           null,
  persistDebounce: null,
  lineNumDebounce: null,
  statsDebounce:   null,
};

// ── Persistence ────────────────────────────────────────────────────────
function persist() {
  const serialisable = tabs.map(t => {
    if (t.type === 'mermaid') {
      return { id: t.id, name: t.name, type: 'mermaid', diagramSrc: t.diagramSrc,
        isDirty: t.isDirty, sourceTabId: t.sourceTabId, sourceMdId: t.sourceMdId };
    }
    if (t.type === 'yaml') {
      return { id: t.id, name: t.name, content: t.content,
        isDirty: t.isDirty, scrollTop: t.scrollTop, type: 'yaml' };
    }
    if (t.type === 'json') {
      return { id: t.id, name: t.name, content: t.content,
        isDirty: t.isDirty, scrollTop: t.scrollTop, type: 'json' };
    }
    if (t.type === 'plaintext') {
      return { id: t.id, name: t.name, content: t.content,
        isDirty: t.isDirty, scrollTop: t.scrollTop, type: 'plaintext' };
    }
    if (t.type === 'html') {
      return { id: t.id, name: t.name, content: t.content,
        isDirty: t.isDirty, scrollTop: t.scrollTop, type: 'html' };
    }
    return { id: t.id, name: t.name, content: t.content,
      isDirty: t.isDirty, scrollTop: t.scrollTop, format: t.format, type: 'markdown' };
  });
  try {
    localStorage.setItem(LS.TABS,       JSON.stringify(serialisable));
    localStorage.setItem(LS.ACTIVE_TAB, activeId || '');
    localStorage.setItem(LS.VIEW,       appState.view);
    localStorage.setItem(LS.FORMAT,     appState.format);
    localStorage.setItem(LS.LINE_NUMS,  appState.lineNums ? '1' : '0');
  } catch (_) {}
}

// Debounced persist — avoids JSON.stringify + localStorage write on every keystroke
function schedulePersist() {
  clearTimeout(appState.persistDebounce);
  appState.persistDebounce = setTimeout(persist, 500);
}

function restore() {
  try {
    const raw = localStorage.getItem(LS.TABS);
    if (raw) {
      const saved = JSON.parse(raw);
      if (Array.isArray(saved) && saved.length) {
        tabs = saved.map(t => t.type === 'mermaid'
          ? { ...t, fileHandle: null }
          : { ...t, fileHandle: null }
        );
        tabSeq = tabs.reduce((m, t) => Math.max(m, parseInt(t.id.replace('tab_',''))||0), 0);
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
  if (activeTab()?.type === 'mermaid') {
    statusWords.textContent = '';
    statusLines.textContent = '';
    return;
  }
  const text  = editorEl.value;
  const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
  const lines = text === '' ? 0 : text.split('\n').length;
  statusWords.textContent = `${words} word${words !== 1 ? 's' : ''}`;
  statusLines.textContent = `${lines} line${lines !== 1 ? 's' : ''}`;
}

function scheduleStats() {
  clearTimeout(appState.statsDebounce);
  appState.statsDebounce = setTimeout(updateStats, 300);
}

function updateCursor() {
  if (activeTab()?.type === 'mermaid') { statusCursor.textContent = ''; return; }
  const pos  = editorEl.selectionStart;
  const text = editorEl.value.substring(0, pos);
  const ln   = text.split('\n').length;
  const col  = pos - text.lastIndexOf('\n');
  statusCursor.textContent = `Ln ${ln}, Col ${col}`;
}

function isWysiwyg() { return appState.view === 'wysiwyg'; }

function updateEmptyState() {
  const noTabs    = tabs.length === 0;
  const isMermaid = !noTabs && activeTab()?.type === 'mermaid';
  // Show code and preview panes for all non-mermaid tabs (markdown, html, yaml, json, plaintext)
  const showCodeAndPreview = !noTabs && !isMermaid;

  emptyState.hidden = !noTabs;
  document.getElementById('pane-code').style.display    = showCodeAndPreview ? '' : 'none';
  document.getElementById('pane-divider').style.display = showCodeAndPreview ? '' : 'none';
  document.getElementById('pane-preview').style.display = showCodeAndPreview ? '' : 'none';
  mermaidPane.classList.toggle('active', isMermaid);
}

// ── Format conversion ──────────────────────────────────────────────────
// MD↔GFM differences are minor — task lists, ~~strike~~, tables all work in both.
// The meaningful conversion is MD/GFM → Confluence wiki markup.
// JSON↔YAML conversion is handled server-side via pandoc.

function convertContent(content, fromFormat, toFormat) {
  if (fromFormat === toFormat) return content;
  // Both standard and GFM are close enough — no transform needed between them.
  if ((fromFormat === 'standard' || fromFormat === 'github') &&
      (toFormat   === 'standard' || toFormat   === 'github')) return content;

  if (toFormat === 'confluence') return mdToConfluence(content);
  if (fromFormat === 'confluence') return confluenceToMd(content);
  return content;
}

function mdToConfluence(md) {
  return md
    // Headings
    .replace(/^#{6}\s+(.+)$/gm, 'h6. $1')
    .replace(/^#{5}\s+(.+)$/gm, 'h5. $1')
    .replace(/^#{4}\s+(.+)$/gm, 'h4. $1')
    .replace(/^#{3}\s+(.+)$/gm, 'h3. $1')
    .replace(/^#{2}\s+(.+)$/gm, 'h2. $1')
    .replace(/^#{1}\s+(.+)$/gm, 'h1. $1')
    // Bold / italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '*_$1_*')
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/\*(.+?)\*/g, '_$1_')
    .replace(/__(.+?)__/g, '*$1*')
    .replace(/_(.+?)_/g, '_$1_')
    // Strikethrough
    .replace(/~~(.+?)~~/g, '-$1-')
    // Inline code
    .replace(/`([^`]+)`/g, '{{$1}}')
    // Fenced code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
      `{code${lang ? `:language=${lang}` : ''}}\n${code}{code}`)
    // Blockquote
    .replace(/^>\s+(.+)$/gm, 'bq. $1')
    // HR
    .replace(/^---+$/gm, '----')
    // Task lists
    .replace(/^- \[x\]\s+(.+)$/gim, '* $1 ✓')
    .replace(/^- \[ \]\s+(.+)$/gm,  '* $1')
    // Unordered lists
    .replace(/^(\s*)[-*+]\s+/gm, (_, indent) => `${'*'.repeat(indent.length / 2 + 1)} `)
    // Ordered lists
    .replace(/^(\s*)\d+\.\s+/gm, (_, indent) => `${'#'.repeat(indent.length / 2 + 1)} `)
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '[$2|$1]')
    // Images
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '!$2!')
    // Tables — basic passthrough note
    .replace(/^\|(.+)\|$/gm, l => l);
}

function confluenceToMd(wiki) {
  return wiki
    .replace(/^h([1-6])\.\s+(.+)$/gm, (_, n, t) => '#'.repeat(parseInt(n)) + ' ' + t)
    .replace(/\*([^*\n]+)\*/g, '**$1**')
    .replace(/_([^_\n]+)_/g, '*$1*')
    .replace(/-([^-\n]+)-/g, '~~$1~~')
    .replace(/\{\{([^}]+)\}\}/g, '`$1`')
    .replace(/\{code(?::language=(\w+))?\}\n([\s\S]*?)\{code\}/g, (_, lang, code) =>
      '```' + (lang || '') + '\n' + code + '```')
    .replace(/^bq\.\s+(.+)$/gm, '> $1')
    .replace(/^----+$/gm, '---')
    .replace(/^\*+\s+/gm, m => '- '.padStart((m.trim().length) * 2))
    .replace(/^#+\s+/gm, m => '1. ')
    .replace(/\[([^|]+)\|([^\]]+)\]/g, '[$2]($1)')
    .replace(/!([^!]+)!/g, '![]($1)');
}

// ── Turndown (HTML → Markdown) ─────────────────────────────────────────
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
    const el       = document.createElement('button');
    el.className   = 'file-tab'
      + (tab.id === activeId ? ' active' : '')
      + (tab.isDirty ? ' dirty' : '')
      + (tab.type === 'mermaid' ? ' mermaid-tab' : '')
      + (tab.type === 'html' ? ' html-tab' : '')
      + (tab.type === 'yaml' ? ' yaml-tab' : '')
      + (tab.type === 'json' ? ' json-tab' : '')
      + (tab.type === 'plaintext' ? ' plaintext-tab' : '');
    el.role        = 'tab';
    el.setAttribute('aria-selected', tab.id === activeId);

    const nameSpan       = document.createElement('span');
    nameSpan.className   = 'tab-name';
    nameSpan.textContent = tab.name;

    const closeBtn = document.createElement('button');
    closeBtn.className   = 'tab-close';
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', `Close ${tab.name}`);
    closeBtn.addEventListener('click', e => { e.stopPropagation(); closeTab(tab.id); });

    el.appendChild(nameSpan);
    el.appendChild(closeBtn);
    el.addEventListener('click', () => switchTab(tab.id));
    tabBarEl.appendChild(el);
  });
  updateEmptyState();
}

// ── Tab operations ─────────────────────────────────────────────────────
function switchTab(id) {
  // Reset filter first — restores original content to textarea before we snapshot it
  window.SD_filter?.reset();

  const prev = activeTab();
  if (prev) {
    if (prev.type === 'mermaid') {
      prev.diagramSrc = window.MermaidEditor?.getSource() || prev.diagramSrc;
    } else {
      prev.content   = editorEl.value;
      prev.scrollTop = editorEl.scrollTop;
    }
  }
  activeId = id;
  const tab = activeTab();
  if (!tab) return;

  if (tab.type === 'mermaid') {
    // Override the grid so the mermaid pane fills the full workspace
    workspace.style.gridTemplateColumns = '';
    workspace.className = 'view-mermaid';
    updateEmptyState();
    renderTabs();
    updateStatusFile();
    window.MermaidEditor?.mount(mermaidPane);
    window.MermaidEditor?.loadMermaid(
      tab.diagramSrc || '',
      tab.sourceTabId || null,
      tab.sourceMdId  !== undefined ? tab.sourceMdId : null
    );
  } else {
    // Restore view mode when switching back to a markdown tab
    workspace.className = `view-${appState.view}`;
    if (appState.view === 'split') restoreSplit();
    else workspace.style.gridTemplateColumns = '';
    window.MermaidEditor?.unmount();
    editorEl.value     = tab.content;
    editorEl.scrollTop = tab.scrollTop || 0;

    // For markdown tabs, use stored format; for other types, show their type as format
    let fmt = (tab.type === 'markdown') ? (tab.format || appState.format || 'standard') : tab.type;
    // Validate fmt against known options; default to 'standard' if unknown
    const validFormats = ['standard', 'github', 'confluence', 'html', 'json', 'yaml', 'plaintext'];
    if (!validFormats.includes(fmt)) fmt = 'standard';
    formatSelect.value = fmt;
    appState.format    = fmt;
    updateEmptyState();
    renderTabs();
    updateStatusFile();
    updateStats();
    updateCursor();
    schedulePreview();
    scheduleHighlight();
    updateLineNumbers();
  }
  persist();
}

function createTab(name, content = '', fileHandle = null, format = null) {
  const tabFormat = format || appState.format || 'standard';
  const tab = {
    id: newTabId(), name, content, isDirty: false,
    fileHandle, scrollTop: 0, format: tabFormat,
    type: 'markdown',
  };
  tabs.push(tab);
  switchTab(tab.id);
  return tab;
}

function createMermaidTab(name = 'Diagram', src = '', sourceTabId = null, sourceMdId = null) {
  const tab = {
    id: newTabId(), name, type: 'mermaid',
    diagramSrc: src, isDirty: false,
    sourceTabId, sourceMdId,
  };
  tabs.push(tab);
  switchTab(tab.id);
  return tab;
}

function createHtmlTab(name, content = '', fileHandle = null) {
  const boilerplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title></title>
</head>
<body>
</body>
</html>`;
  const tab = {
    id: newTabId(), name, content: content || boilerplate, isDirty: false,
    fileHandle, scrollTop: 0, type: 'html',
  };
  tabs.push(tab);
  // HTML files are code — open in code view, don't persist view change
  const prevView = appState.view;
  appState.view = 'code';
  workspace.className = 'view-code';
  switchTab(tab.id);
  appState.view = prevView;
  return tab;
}

function createYamlTab(name, content = '', fileHandle = null) {
  const tab = {
    id: newTabId(), name, content: content || '---\n', isDirty: false,
    fileHandle, scrollTop: 0, type: 'yaml',
  };
  tabs.push(tab);
  switchTab(tab.id);
  return tab;
}

function createJsonTab(name, content = '', fileHandle = null) {
  const tab = {
    id: newTabId(), name, content: content || '{}', isDirty: false,
    fileHandle, scrollTop: 0, type: 'json',
  };
  tabs.push(tab);
  switchTab(tab.id);
  return tab;
}

function createPlainTextTab(name, content = '', fileHandle = null) {
  const tab = {
    id: newTabId(), name, content, isDirty: false,
    fileHandle, scrollTop: 0, type: 'plaintext',
  };
  tabs.push(tab);
  switchTab(tab.id);
  return tab;
}

function closeTab(id) {
  const tab = tabs.find(t => t.id === id);
  if (!tab) return;
  if (tab.isDirty && !confirm(`"${tab.name}" has unsaved changes. Close anyway?`)) return;
  const idx = tabs.indexOf(tab);
  tabs.splice(idx, 1);
  if (tabs.length === 0) {
    activeId = null;
    editorEl.value = '';
    window.MermaidEditor?.unmount();
    renderTabs();
    updateStatusFile();
    updateStats();
    updateLineNumbers();
    previewEl.innerHTML = '';
    persist();
    return;
  }
  if (activeId === id) {
    activeId = tabs[Math.min(idx, tabs.length - 1)].id;
    const next = activeTab();
    if (next.type === 'mermaid') {
      updateEmptyState();
      window.MermaidEditor?.mount(mermaidPane);
      window.MermaidEditor?.loadMermaid(next.diagramSrc || '', next.sourceTabId, next.sourceMdId);
    } else {
      window.MermaidEditor?.unmount();
      editorEl.value     = next.content;
      editorEl.scrollTop = next.scrollTop || 0;
      updateStats();
      schedulePreview();
      updateLineNumbers();
    }
    updateStatusFile();
    updateEmptyState();
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
  statusFile.textContent = tab ? tab.name + (tab.isDirty ? ' •' : '') : 'No file';
}

// ── File System Access API ─────────────────────────────────────────────
const PICKER_OPTS = {
  types: [{
    description: 'All Supported Files',
    accept: {
      'text/markdown': ['.md', '.markdown'],
      'text/yaml': ['.yml', '.yaml'],
      'application/json': ['.json', '.jsonc'],
      'text/html': ['.html', '.htm'],
      'application/epub+zip': ['.epub'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
    },
  }],
  excludeAcceptAllOption: false,
};
const YamlPickerOpts = {
  types: [{ description: 'YAML', accept: { 'text/yaml': ['.yml', '.yaml'] } }],
  excludeAcceptAllOption: false,
};
const JsonPickerOpts = {
  types: [{ description: 'JSON', accept: { 'application/json': ['.json', '.jsonc'] } }],
  excludeAcceptAllOption: false,
};
function fsaSupported() { return typeof window.showOpenFilePicker === 'function'; }

document.getElementById('btn-new').addEventListener('click', async () => {
  const fmt = await showFiletypePicker('Untitled', 'Create new file as:');
  if (!fmt) return;

  const tabNames = {
    'markdown': 'Untitled.md',
    'github': 'Untitled.md',
    'confluence': 'Untitled.md',
    'html': 'Untitled.html',
    'yaml': 'Untitled.yaml',
    'json': 'Untitled.json',
    'plaintext': 'Untitled.txt',
  };

  const name = tabNames[fmt] || 'Untitled.md';

  if (fmt === 'html') {
    createHtmlTab(name, '');
  } else if (fmt === 'yaml') {
    createYamlTab(name, '');
  } else if (fmt === 'json') {
    createJsonTab(name, '');
  } else if (fmt === 'plaintext') {
    createPlainTextTab(name, '');
  } else {
    // markdown, github, confluence — these map directly to tab formats
    createTab(name, '', null, fmt);
  }
  markDirty();
});

document.getElementById('btn-new-diagram').addEventListener('click', () => {
  createMermaidTab('Diagram');
});

document.getElementById('btn-open').addEventListener('click', async () => {
  if (!fsaSupported()) { showMsg('File System Access API not supported', true); return; }
  let handles;
  try { handles = await window.showOpenFilePicker({ ...PICKER_OPTS, multiple: true }); }
  catch (e) { if (e.name !== 'AbortError') showMsg('Could not open file picker', true); return; }
  for (const handle of handles) {
    const file = await handle.getFile();
    const text = await file.text();
    const lname = file.name.toLowerCase();

    // HTML: prompt for open as HTML or convert to Markdown
    if (lname.endsWith('.html') || lname.endsWith('.htm')) {
      const choice = await showHtmlImportPicker(file.name);
      if (choice === null) continue; // cancelled
      if (choice === 'html') {
        const existing = tabs.find(t => t.name === file.name && !t.isDirty && t.type === 'html');
        if (existing) { existing.content = text; existing.fileHandle = handle; switchTab(existing.id); }
        else createHtmlTab(file.name, text, handle);
      } else {
        // Convert HTML to Markdown using Turndown
        const md = turndown.turndown(text);
        const tabName = file.name.replace(/\.html?$/i, '.md');
        createTab(tabName, md, null);
        showMsg('Converted to Markdown');
      }
      continue;
    }

    // YAML files
    if (lname.endsWith('.yml') || lname.endsWith('.yaml')) {
      const existing = tabs.find(t => t.name === file.name && !t.isDirty && t.type === 'yaml');
      if (existing) { existing.content = text; existing.fileHandle = handle; switchTab(existing.id); }
      else createYamlTab(file.name, text, handle);
      continue;
    }

    // JSON files
    if (lname.endsWith('.json') || lname.endsWith('.jsonc')) {
      const existing = tabs.find(t => t.name === file.name && !t.isDirty && t.type === 'json');
      if (existing) { existing.content = text; existing.fileHandle = handle; switchTab(existing.id); }
      else createJsonTab(file.name, text, handle);
      continue;
    }

    // Plain text
    if (lname.endsWith('.txt')) {
      const existing = tabs.find(t => t.name === file.name && !t.isDirty && t.type === 'plaintext');
      if (existing) { existing.content = text; existing.fileHandle = handle; switchTab(existing.id); }
      else createPlainTextTab(file.name, text, handle);
      continue;
    }

    // EPUB: server-side import
    if (lname.endsWith('.epub')) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch('/api/import/epub', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) { showMsg(data.error || 'Import failed', true); return; }
        const tabName = file.name.replace(/\.epub$/i, '') + '.md';
        const tab = createTab(tabName, data.markdown, null);
        tab.epubImages = data.images || {};
        showMsg('EPUB imported');
      } catch (e) { showMsg(`Import failed: ${e.message}`, true); }
      continue;
    }

    // DOCX: server-side import
    if (lname.endsWith('.docx')) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch('/api/import/docx', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) { showMsg(data.error || 'Import failed', true); return; }
        const tabName = file.name.replace(/\.docx$/i, '') + '.md';
        createTab(tabName, data.markdown, null);
        showMsg('DOCX imported');
      } catch (e) { showMsg(`Import failed: ${e.message}`, true); }
      continue;
    }

    // .md and .markdown files: standard markdown tabs
    if (lname.endsWith('.md') || lname.endsWith('.markdown')) {
      const existing = tabs.find(t => t.name === file.name && !t.isDirty);
      if (existing) { existing.content = text; existing.fileHandle = handle; switchTab(existing.id); }
      else createTab(file.name, text, handle, 'standard');
      continue;
    }

    // Unknown extension: show filetype picker modal
    const chosenType = await showFiletypePicker(file.name, `Unrecognized file "${file.name}" — select type:`);
    if (!chosenType) continue;

    if (chosenType === 'html') {
      createHtmlTab(file.name, text, handle);
    } else if (chosenType === 'yaml') {
      createYamlTab(file.name, text, handle);
    } else if (chosenType === 'json') {
      createJsonTab(file.name, text, handle);
    } else if (chosenType === 'plaintext') {
      createPlainTextTab(file.name, text, handle);
    } else {
      // markdown, github, confluence
      createTab(file.name, text, handle, chosenType);
    }
  }
});

// ── Filetype picker modal ───────────────────────────────────────────────
const ftModal = document.getElementById('filetype-picker-modal');
const ftDesc = document.getElementById('filetype-picker-desc');
const ftSelect = document.getElementById('filetype-select');
const ftCancelBtn = document.getElementById('filetype-cancel-btn');
const ftOkBtn = document.getElementById('filetype-ok-btn');

let ftResolve = null;

ftCancelBtn.addEventListener('click', () => { ftModal.hidden = true; ftResolve(null); });
ftOkBtn.addEventListener('click', () => { ftModal.hidden = true; ftResolve(ftSelect.value); });
ftModal.addEventListener('click', e => { if (e.target === ftModal) { ftModal.hidden = true; ftResolve(null); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !ftModal.hidden) { ftModal.hidden = true; ftResolve(null); } });

function showFiletypePicker(filename, desc) {
  ftDesc.textContent = desc || `Unrecognized file "${filename}"`;
  ftSelect.value = 'markdown';
  ftModal.hidden = false;
  return new Promise(resolve => { ftResolve = resolve; });
}

// ── HTML import picker modal ─────────────────────────────────────────────
const htmlImportModal = document.getElementById('html-import-modal');
const htmlImportFilename = document.getElementById('html-import-filename');
const htmlImportCancelBtn = document.getElementById('html-import-cancel-btn');
const htmlImportOkBtn = document.getElementById('html-import-ok-btn');
const htmlImportRadios = document.querySelectorAll('input[name="html-import-choice"]');

let htmlImportResolve = null;

htmlImportCancelBtn.addEventListener('click', () => { htmlImportModal.hidden = true; htmlImportResolve(null); });
htmlImportOkBtn.addEventListener('click', () => {
  htmlImportModal.hidden = true;
  const selected = document.querySelector('input[name="html-import-choice"]:checked');
  htmlImportResolve(selected ? selected.value : null);
});
htmlImportModal.addEventListener('click', e => { if (e.target === htmlImportModal) { htmlImportModal.hidden = true; htmlImportResolve(null); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !htmlImportModal.hidden) { htmlImportModal.hidden = true; htmlImportResolve(null); } });

function showHtmlImportPicker(filename) {
  htmlImportFilename.textContent = `"${filename}"`;
  // Reset to "Open as HTML" selected
  document.querySelector('input[name="html-import-choice"][value="html"]').checked = true;
  htmlImportModal.hidden = false;
  return new Promise(resolve => { htmlImportResolve = resolve; });
}

async function saveToHandle(handle, content) {
  const writable = await handle.createWritable();
  try {
    await writable.write(content);
    await writable.close();
  } catch (e) {
    await writable.abort().catch(() => {});
    throw e;
  }
}

document.getElementById('btn-save').addEventListener('click', async () => {
  if (!fsaSupported()) { showMsg('File System Access API not supported', true); return; }
  const tab = activeTab();
  if (!tab) return;
  if (tab.type === 'mermaid') { showMsg('Use Export in the diagram editor to save', true); return; }
  if (!tab.fileHandle) { document.getElementById('btn-save-as').click(); return; }
  const opts = tab.type === 'html' ? HTML_PICKER_OPTS : PICKER_OPTS;
  try {
    const perm = await tab.fileHandle.queryPermission({ mode: 'readwrite' });
    if (perm !== 'granted') await tab.fileHandle.requestPermission({ mode: 'readwrite' });
    await saveToHandle(tab.fileHandle, editorEl.value);
    tab.content = editorEl.value;
    markClean();
    showMsg('Saved');
  } catch (e) { showMsg(`Save failed: ${e.message}`, true); }
  persist();
});

document.getElementById('btn-save-as').addEventListener('click', async () => {
  if (!fsaSupported()) { showMsg('File System Access API not supported', true); return; }
  const tab = activeTab();
  if (!tab) return;
  if (tab.type === 'mermaid') { showMsg('Use Export in the diagram editor to save', true); return; }
  const opts = tab.type === 'html' ? HTML_PICKER_OPTS : PICKER_OPTS;
  let handle;
  try { handle = await window.showSaveFilePicker({ ...opts, suggestedName: tab.name }); }
  catch (e) { if (e.name !== 'AbortError') showMsg('Could not open save dialog', true); return; }
  try {
    await saveToHandle(handle, editorEl.value);
    tab.fileHandle = handle; tab.name = handle.name; tab.content = editorEl.value;
    markClean(); showMsg(`Saved as ${handle.name}`); persist();
  } catch (e) { showMsg(`Save failed: ${e.message}`, true); }
});

const EPUB_PICKER_OPTS = {
  types: [{ description: 'EPUB', accept: { 'application/epub+zip': ['.epub'] } }],
  excludeAcceptAllOption: false,
};
const HTML_PICKER_OPTS = {
  types: [{ description: 'HTML', accept: { 'text/html': ['.html', '.htm'] } }],
  excludeAcceptAllOption: false,
};
const DOCX_PICKER_OPTS = {
  types: [{ description: 'Word Document', accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] } }],
  excludeAcceptAllOption: false,
};

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); document.getElementById('btn-save').click(); }
});

// ── Format select ──────────────────────────────────────────────────────
formatSelect.addEventListener('change', () => {
  const newFormat = formatSelect.value;
  const tab = activeTab();
  if (!tab) { appState.format = newFormat; return; }

  // Non-markdown tabs: yaml/json can switch to each other, others cannot change format
  if (tab.type === 'yaml') {
    if (newFormat !== 'json') {
      formatSelect.value = 'yaml'; // reset to current
      showMsg('Only JSON format is available for YAML tabs', true);
      return;
    }
    // Convert YAML to JSON
    convertYamlToJson();
    return;
  }
  if (tab.type === 'json') {
    if (newFormat !== 'yaml') {
      formatSelect.value = 'json'; // reset to current
      showMsg('Only YAML format is available for JSON tabs', true);
      return;
    }
    // Convert JSON to YAML
    convertJsonToYaml();
    return;
  }
  if (tab.type === 'html' || tab.type === 'plaintext') {
    formatSelect.value = tab.type;
    showMsg(`Format cannot be changed for ${tab.type} tabs`, true);
    return;
  }

  // Markdown tabs: cannot switch to yaml/json/plaintext/html
  if (['yaml', 'json', 'plaintext', 'html'].includes(newFormat)) {
    formatSelect.value = tab.format || appState.format;
    showMsg('Cannot switch from Markdown to ' + newFormat, true);
    return;
  }

  const oldFormat = tab.format || appState.format;
  if (oldFormat !== newFormat) {
    const converted = convertContent(editorEl.value, oldFormat, newFormat);
    if (converted !== editorEl.value) {
      editorEl.value = converted;
      tab.content    = converted;
      markDirty();
      schedulePreview();
      scheduleHighlight();
    }
  }
  tab.format     = newFormat;
  appState.format = newFormat;
  persist();
});

async function convertYamlToJson() {
  const tab = activeTab();
  if (!tab || tab.type !== 'yaml') return;
  try {
    const res = await fetch('/api/convert/yaml-to-json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: editorEl.value }),
    });
    const data = await res.json();
    if (data.error) { showMsg(data.error, true); return; }
    editorEl.value = data.content;
    tab.content = data.content;
    tab.type = 'json';
    tab.name = tab.name.replace(/\.ya?ml$/i, '.json');
    formatSelect.value = 'json';
    appState.format = 'json';
    markDirty();
    schedulePreview();
    scheduleHighlight();
    persist();
    showMsg('Converted to JSON');
    renderTabs();
  } catch (e) {
    showMsg('Conversion failed: ' + e.message, true);
  }
}

async function convertJsonToYaml() {
  const tab = activeTab();
  if (!tab || tab.type !== 'json') return;
  try {
    const res = await fetch('/api/convert/json-to-yaml', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: editorEl.value }),
    });
    const data = await res.json();
    if (data.error) { showMsg(data.error, true); return; }
    editorEl.value = data.content;
    tab.content = data.content;
    tab.type = 'yaml';
    tab.name = tab.name.replace(/\.json$/i, '.yaml');
    formatSelect.value = 'yaml';
    appState.format = 'yaml';
    markDirty();
    schedulePreview();
    scheduleHighlight();
    persist();
    showMsg('Converted to YAML');
    renderTabs();
  } catch (e) {
    showMsg('Conversion failed: ' + e.message, true);
  }
}

// ── View modes ─────────────────────────────────────────────────────────
function setView(view) {
  appState.view = view;
  workspace.className = `view-${view}`;

  // Reset any inline grid override when not in split — CSS takes over
  if (view !== 'split') {
    workspace.style.gridTemplateColumns = '';
  } else {
    restoreSplit();
  }

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

// ── Live preview ───────────────────────────────────────────────────────
function schedulePreview() {
  if (appState.view === 'code') return;
  clearTimeout(appState.previewDebounce);
  appState.previewDebounce = setTimeout(renderPreview, 300);
}

async function renderPreview() {
  const tab = activeTab();
  if (!tab) return;

  if (tab.type === 'html') {
    // HTML tabs: sandbox in iframe so scripts can't navigate the parent page
    previewEl.innerHTML = '<iframe sandbox="allow-scripts" class="html-preview-frame" title="HTML preview"></iframe>';
    const frame = previewEl.querySelector('.html-preview-frame');
    frame.srcdoc = tab.content;
    return;
  }

  if (tab.type === 'yaml' || tab.type === 'json' || tab.type === 'plaintext') {
    // For non-markdown types, show content as-is in a pre block
    previewEl.innerHTML = '<pre class="preview-plain">' + escapeHtml(tab.content) + '</pre>';
    if (isWysiwyg()) previewEl.contentEditable = 'true';
    return;
  }

  // Markdown tabs (standard, github, confluence)
  const flavor = appState.format === 'github' ? 'github' : 'standard';
  const content = appState.format === 'confluence'
    ? confluenceToMd(editorEl.value)   // convert to MD for server rendering
    : editorEl.value;
  const res  = await fetch('/api/preview', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, flavor }),
  });
  const data = await res.json();
  previewEl.innerHTML = data.html;
  previewEl.querySelectorAll('.mermaid').forEach((el, idx) => {
    el.contentEditable = 'false';
    el.dataset.src = el.textContent;
    el.title = 'Click to edit in Mermaid editor';
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => {
      const src        = el.dataset.src?.trim() || '';
      const currentTab = activeTab();
      // Find or create a mermaid tab linked to this block
      const existing = tabs.find(t =>
        t.type === 'mermaid' &&
        t.sourceTabId === currentTab?.id &&
        t.sourceMdId  === idx
      );
      if (existing) {
        switchTab(existing.id);
      } else {
        createMermaidTab(`Diagram (${currentTab?.name || 'doc'})`, src, currentTab?.id, idx);
      }
    });
    if (window.mermaid) mermaid.init(undefined, el);
  });
  if (isWysiwyg()) previewEl.contentEditable = 'true';
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Syntax highlighting ────────────────────────────────────────────────
let hljsOverlay = null;

function ensureOverlay() {
  if (!hljsOverlay) {
    hljsOverlay = document.createElement('pre');
    hljsOverlay.id = 'hljs-overlay';
    const code = document.createElement('code');
    code.className = 'language-markdown';
    hljsOverlay.appendChild(code);
    editorInner.appendChild(hljsOverlay);
  }
  return hljsOverlay;
}

// Update overlay on next animation frame (fast) or debounce for very large docs.
// The overlay uses color: transparent base text so only colored tokens show —
// the textarea text is always visible underneath.
function scheduleHighlight() {
  if (appState.hlRaf) cancelAnimationFrame(appState.hlRaf);
  clearTimeout(appState.hlDebounce);
  if (editorEl.value.length > 50000) {
    appState.hlDebounce = setTimeout(applyHighlight, 300);
  } else {
    appState.hlRaf = requestAnimationFrame(applyHighlight);
  }
}

function applyHighlight() {
  appState.hlRaf = null;
  if (!window.hljs) return;
  const overlay = ensureOverlay();
  const code    = overlay.querySelector('code');
  const tab     = activeTab();
  if (tab && tab.type === 'html' && hljs.getLanguage('html')) {
    code.className = 'language-html';
    const result = hljs.highlight(editorEl.value, { language: 'html' });
    code.innerHTML = result.value;
  } else if (tab && tab.type === 'json' && hljs.getLanguage('json')) {
    code.className = 'language-json';
    const result = hljs.highlight(editorEl.value, { language: 'json' });
    code.innerHTML = result.value;
  } else if (tab && tab.type === 'yaml' && hljs.getLanguage('yaml')) {
    code.className = 'language-yaml';
    const result = hljs.highlight(editorEl.value, { language: 'yaml' });
    code.innerHTML = result.value;
  } else if (tab && tab.type === 'plaintext') {
    // No highlighting for plaintext - clear any existing
    code.className = '';
    code.innerHTML = '';
  } else if (hljs.getLanguage('markdown')) {
    code.className = 'language-markdown';
    const result = hljs.highlight(editorEl.value, { language: 'markdown' });
    code.innerHTML = result.value;
  }
  overlay.scrollTop  = editorEl.scrollTop;
  overlay.scrollLeft = editorEl.scrollLeft;
}

editorEl.addEventListener('scroll', () => {
  if (hljsOverlay) {
    hljsOverlay.scrollTop  = editorEl.scrollTop;
    hljsOverlay.scrollLeft = editorEl.scrollLeft;
  }
  syncLineNumScroll();
});

// ── WYSIWYG → Markdown sync ────────────────────────────────────────────
previewEl.addEventListener('input', () => {
  if (!isWysiwyg()) return;
  clearTimeout(appState.wysiwygDebounce);
  appState.wysiwygDebounce = setTimeout(() => {
    editorEl.value = turndown.turndown(previewEl.innerHTML);
    markDirty(); updateStats(); persist();
  }, 400);
});

// ── Editor input ───────────────────────────────────────────────────────
editorEl.addEventListener('input', () => {
  const tab = activeTab();
  if (tab) tab.content = editorEl.value;
  markDirty();
  scheduleStats();
  schedulePreview();
  scheduleHighlight();
  scheduleLineNumbers();
  schedulePersist();
});

editorEl.addEventListener('keyup',   updateCursor);
editorEl.addEventListener('click',   updateCursor);

editorEl.addEventListener('filter-applied', () => {
  schedulePreview();
  scheduleHighlight();
});

editorEl.addEventListener('filter-cleared', () => {
  schedulePreview();
  scheduleHighlight();
  updateStats();
  updateCursor();
});

// ── List editing helpers ───────────────────────────────────────────────
function getLineAtCursor() {
  const pos  = editorEl.selectionStart;
  const text = editorEl.value;
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
  const lineEnd   = text.indexOf('\n', pos);
  return {
    start: lineStart,
    end:   lineEnd === -1 ? text.length : lineEnd,
    text:  text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd),
  };
}

function parseListItem(lineText) {
  // Task list: `- [ ] content` or `* [x] content`
  let m = lineText.match(/^(\s*)([-*+]) (\[[ x]\] )(.*)$/);
  if (m) return { indent: m[1], bullet: m[2], taskMark: m[3], content: m[4], type: 'task' };
  // Unordered list
  m = lineText.match(/^(\s*)([-*+]) (.*)$/);
  if (m) return { indent: m[1], bullet: m[2], content: m[3], type: 'unordered' };
  // Ordered list
  m = lineText.match(/^(\s*)(\d+)\. (.*)$/);
  if (m) return { indent: m[1], num: parseInt(m[2]), content: m[3], type: 'ordered' };
  return null;
}

function setEditorValue(text, pos) {
  editorEl.value = text;
  if (pos !== undefined) editorEl.selectionStart = editorEl.selectionEnd = pos;
  const tab = activeTab();
  if (tab) tab.content = text;
  markDirty();
  scheduleStats();
  schedulePreview();
  scheduleHighlight();
  scheduleLineNumbers();
  schedulePersist();
}

function handleListEnter(e) {
  if (editorEl.selectionStart !== editorEl.selectionEnd) return false;
  const line = getLineAtCursor();
  const item = parseListItem(line.text);
  if (!item) return false;

  e.preventDefault();
  const pos  = editorEl.selectionStart;
  const text = editorEl.value;

  if (!item.content.trim()) {
    // Empty list item — exit the list (remove marker, keep indent)
    const newText = text.substring(0, line.start) + item.indent + text.substring(line.end);
    setEditorValue(newText, line.start + item.indent.length);
    return true;
  }

  // Continue the list on the next line
  let nextMarker;
  if (item.type === 'task') {
    nextMarker = item.indent + item.bullet + ' [ ] ';
  } else if (item.type === 'ordered') {
    nextMarker = item.indent + (item.num + 1) + '. ';
  } else {
    nextMarker = item.indent + item.bullet + ' ';
  }

  const newText = text.substring(0, pos) + '\n' + nextMarker + text.substring(pos);
  setEditorValue(newText, pos + 1 + nextMarker.length);
  return true;
}

function handleListIndent() {
  if (editorEl.selectionStart !== editorEl.selectionEnd) return false;
  const line = getLineAtCursor();
  if (!parseListItem(line.text)) return false;

  const text    = editorEl.value;
  const pos     = editorEl.selectionStart;
  const newLine = '  ' + line.text;
  setEditorValue(text.substring(0, line.start) + newLine + text.substring(line.end), pos + 2);
  return true;
}

function handleListUnindent() {
  if (editorEl.selectionStart !== editorEl.selectionEnd) return;
  const line = getLineAtCursor();
  const item = parseListItem(line.text);
  if (!item) return;

  const text = editorEl.value;
  const pos  = editorEl.selectionStart;

  if (item.indent.length === 0) {
    // Top-level: remove list marker entirely
    const newLine = item.content;
    const removed = line.text.length - newLine.length;
    setEditorValue(text.substring(0, line.start) + newLine + text.substring(line.end),
      Math.max(line.start, pos - removed));
  } else {
    // Subitem: remove 2 spaces of indent
    const remove  = Math.min(2, item.indent.length);
    const newLine = line.text.substring(remove);
    setEditorValue(text.substring(0, line.start) + newLine + text.substring(line.end),
      Math.max(line.start, pos - remove));
  }
}

editorEl.addEventListener('keydown', e => {
  updateCursor();
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (handleListEnter(e)) return;
  }
  if (e.key === 'Tab') {
    e.preventDefault();
    if (e.shiftKey) {
      handleListUnindent();
    } else if (!handleListIndent()) {
      const s = editorEl.selectionStart, end = editorEl.selectionEnd;
      editorEl.value = editorEl.value.substring(0, s) + '  ' + editorEl.value.substring(end);
      editorEl.selectionStart = editorEl.selectionEnd = s + 2;
      markDirty();
    }
  }
});

// ── Line numbers ───────────────────────────────────────────────────────
function updateLineNumbers() {
  if (!appState.lineNums) return;
  const lines = editorEl.value ? editorEl.value.split('\n').length : 1;
  lineNumsEl.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n');
}

function scheduleLineNumbers() {
  if (!appState.lineNums) return;
  clearTimeout(appState.lineNumDebounce);
  appState.lineNumDebounce = setTimeout(updateLineNumbers, 200);
}

function syncLineNumScroll() {
  lineNumsEl.scrollTop = editorEl.scrollTop;
}

btnLineNums.addEventListener('click', () => {
  appState.lineNums = !appState.lineNums;
  btnLineNums.setAttribute('aria-pressed', appState.lineNums);
  btnLineNums.classList.toggle('active', appState.lineNums);
  lineNumsEl.classList.toggle('visible', appState.lineNums);
  if (appState.lineNums) updateLineNumbers();
  try { localStorage.setItem(LS.LINE_NUMS, appState.lineNums ? '1' : '0'); } catch (_) {}
});

// ── Toolbar ────────────────────────────────────────────────────────────
const WYSIWYG_EXEC = {
  bold:   () => document.execCommand('bold'),
  italic: () => document.execCommand('italic'),
  strike: () => document.execCommand('strikeThrough'),
};
const WYSIWYG_BLOCK = {
  h1: () => document.execCommand('formatBlock', false, 'h1'),
  h2: () => document.execCommand('formatBlock', false, 'h2'),
  h3: () => document.execCommand('formatBlock', false, 'h3'),
  blockquote: () => document.execCommand('formatBlock', false, 'blockquote'),
  ul: () => document.execCommand('insertUnorderedList'),
  ol: () => document.execCommand('insertOrderedList'),
  hr: () => document.execCommand('insertHorizontalRule'),
  code: () => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const code  = document.createElement('code');
    code.textContent = sel.toString() || 'code';
    range.deleteContents(); range.insertNode(code); sel.collapseToEnd();
  },
  link: () => {
    const url = prompt('URL:'); if (!url) return;
    const text = window.getSelection().toString() || url;
    document.execCommand('insertHTML', false, `<a href="${url}">${text}</a>`);
  },
  image: () => {
    const url = prompt('Image URL:'); if (!url) return;
    const alt = prompt('Alt text:', '') || '';
    document.execCommand('insertHTML', false, `<img src="${url}" alt="${alt}" />`);
  },
  table: () => document.execCommand('insertHTML', false,
    `<table><thead><tr><th>Header</th><th>Header</th></tr></thead><tbody><tr><td>Cell</td><td>Cell</td></tr></tbody></table>`),
  codeblock: () => {
    const text = window.getSelection().toString() || '';
    document.execCommand('insertHTML', false, `<pre><code>${text || 'code'}</code></pre>`);
  },
  task: () => document.execCommand('insertHTML', false,
    `<ul><li><input type="checkbox" /> Task item</li></ul>`),
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
    if (action === 'table') { openTablePicker(); return; }
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
  markDirty(); updateStats();
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
    insert = snippet.prefix + text; cursorOffset = insert.length;
  } else if (snippet.block) {
    insert = snippet.block.replace('{sel}', sel); cursorOffset = insert.length;
  } else if (snippet.template) {
    const text = sel || snippet.placeholder;
    insert = snippet.template.replace('{sel}', text); cursorOffset = insert.length;
  }

  editorEl.value = before + insert + after;
  editorEl.selectionStart = start;
  editorEl.selectionEnd   = start + cursorOffset;
  editorEl.focus();
  markDirty(); updateStats(); schedulePreview(); scheduleHighlight();
}

// ── Draggable split divider ────────────────────────────────────────────
(function initDivider() {
  const divider  = document.getElementById('pane-divider');
  const paneCode = document.getElementById('pane-code');
  let dragging = false, startX, startW;

  divider.addEventListener('mousedown', e => {
    if (appState.view !== 'split') return;
    dragging = true; startX = e.clientX;
    startW = paneCode.getBoundingClientRect().width;
    divider.classList.add('dragging');
    document.body.style.cssText += ';cursor:col-resize;user-select:none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const total = workspace.getBoundingClientRect().width;
    const newW  = Math.min(Math.max(startW + (e.clientX - startX), 120), total - 124);
    const pct   = (newW / total * 100).toFixed(2);
    workspace.style.gridTemplateColumns = `${pct}% 4px 1fr`;
    try { localStorage.setItem(LS.SPLIT, pct); } catch (_) {}
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false; divider.classList.remove('dragging');
    document.body.style.cursor = ''; document.body.style.userSelect = '';
  });
})();


function restoreSplit() {
  try {
    const pct = localStorage.getItem(LS.SPLIT);
    if (pct) workspace.style.gridTemplateColumns = `${pct}% 4px 1fr`;
  } catch (_) {}
}

// ── Font / Theme ───────────────────────────────────────────────────────
function applyFont(value) {
  const opt = fontSelect.querySelector(`option[value="${value}"]`);
  if (!opt) return;
  fontLink.href = `https://fonts.googleapis.com/css2?family=${opt.dataset.url}&display=swap`;
  document.documentElement.style.setProperty('--font-preview', `'${value}', serif`);
  try { localStorage.setItem(LS.FONT, value); } catch (_) {}
}
fontSelect.addEventListener('change', () => applyFont(fontSelect.value));

const HLJS_THEMES = {
  dark: 'atom-one-dark', light: 'atom-one-light',
  hc: 'base16/hardcore', warm: 'atom-one-dark',
};

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeSelect.value = theme;
  const hljsLink = document.getElementById('hljs-theme-link');
  if (hljsLink) hljsLink.href =
    `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/${HLJS_THEMES[theme] || 'atom-one-dark'}.min.css`;
  try { localStorage.setItem(LS.THEME, theme); } catch (_) {}
}
themeSelect.addEventListener('change', () => applyTheme(themeSelect.value));

// ── Init ───────────────────────────────────────────────────────────────
(function init() {
  // Clear stale preview width key from old versions
  try { localStorage.removeItem('sd_preview_w'); } catch (_) {}

  applyTheme(localStorage.getItem(LS.THEME) || 'dark');

  const savedFont = localStorage.getItem(LS.FONT) || 'Lora';
  fontSelect.value = savedFont; applyFont(savedFont);

  const savedFormat = localStorage.getItem(LS.FORMAT) || 'standard';
  appState.format    = savedFormat;
  formatSelect.value = savedFormat;

  const hadTabs = restore();
  if (!hadTabs) {
    // Start with empty state, no forced tab
    activeId = null;
    updateEmptyState();
  }

  renderTabs();
  const tab = activeTab();
  if (tab) {
    editorEl.value     = tab.content;
    editorEl.scrollTop = tab.scrollTop || 0;
    formatSelect.value = tab.format || appState.format;
    appState.format    = formatSelect.value;
  }

  const savedView = localStorage.getItem(LS.VIEW) || 'split';
  setView(savedView);

  const savedLineNums = localStorage.getItem(LS.LINE_NUMS) === '1';
  appState.lineNums = savedLineNums;
  btnLineNums.setAttribute('aria-pressed', savedLineNums);
  btnLineNums.classList.toggle('active', savedLineNums);
  lineNumsEl.classList.toggle('visible', savedLineNums);

  updateStatusFile(); updateStats(); updateCursor();
  if (tab) { schedulePreview(); scheduleHighlight(); updateLineNumbers(); }
  // Retry highlight after CDN scripts have loaded
  setTimeout(scheduleHighlight, 1500);
})();

// ── Table picker ───────────────────────────────────────────────────────
const TABLE_GRID_ROWS = 8, TABLE_GRID_COLS = 10;
let tblRows = 3, tblCols = 3;

(function initTablePicker() {
  const modal   = document.getElementById('table-picker-modal');
  const preview = document.getElementById('table-picker-preview');
  if (!modal || !preview) return;

  // Build grid cells
  for (let r = 0; r < TABLE_GRID_ROWS; r++) {
    for (let c = 0; c < TABLE_GRID_COLS; c++) {
      const cell = document.createElement('div');
      cell.className   = 'tbl-cell';
      cell.dataset.r   = r;
      cell.dataset.c   = c;
      cell.addEventListener('mouseover', () => { tblRows = r + 1; tblCols = c + 1; updateTablePreview(); });
      cell.addEventListener('click',     () => { modal.hidden = true; insertTableMarkdown(tblRows, tblCols); });
      preview.appendChild(cell);
    }
  }

  const rowsSlider = document.getElementById('tbl-rows-slider');
  const colsSlider = document.getElementById('tbl-cols-slider');
  const rowsNum    = document.getElementById('tbl-rows-num');
  const colsNum    = document.getElementById('tbl-cols-num');

  function syncSliders() {
    tblRows = parseInt(rowsSlider.value) || 3;
    tblCols = parseInt(colsSlider.value) || 3;
    rowsNum.value = tblRows; colsNum.value = tblCols;
    updateTablePreview();
  }
  function syncNums() {
    tblRows = Math.max(1, parseInt(rowsNum.value) || 3);
    tblCols = Math.max(1, parseInt(colsNum.value) || 3);
    rowsSlider.value = tblRows; colsSlider.value = tblCols;
    updateTablePreview();
  }
  rowsSlider.addEventListener('input', syncSliders);
  colsSlider.addEventListener('input', syncSliders);
  rowsNum.addEventListener('input',   syncNums);
  colsNum.addEventListener('input',   syncNums);

  document.getElementById('tbl-cancel-btn').addEventListener('click', () => { modal.hidden = true; });
  document.getElementById('tbl-insert-btn').addEventListener('click', () => {
    modal.hidden = true;
    insertTableMarkdown(tblRows, tblCols);
  });
  modal.addEventListener('click', e => { if (e.target === modal) modal.hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) modal.hidden = true; });
})();

function updateTablePreview() {
  const rowsNum = document.getElementById('tbl-rows-num');
  const colsNum = document.getElementById('tbl-cols-num');
  const label   = document.getElementById('tbl-size-label');
  if (rowsNum) rowsNum.value = tblRows;
  if (colsNum) colsNum.value = tblCols;
  if (label)   label.textContent = `${tblRows} × ${tblCols}`;
  document.querySelectorAll('.tbl-cell').forEach(cell => {
    const r = parseInt(cell.dataset.r), c = parseInt(cell.dataset.c);
    cell.classList.toggle('tbl-cell--active', r < tblRows && c < tblCols);
  });
}

function openTablePicker() {
  const modal = document.getElementById('table-picker-modal');
  if (!modal) return;
  modal.hidden = false;
  updateTablePreview();
}

function insertTableMarkdown(rows, cols) {
  const headers  = Array.from({ length: cols }, (_, i) => `Header ${i + 1}`);
  const header   = '| ' + headers.join(' | ') + ' |';
  const sep      = '| ' + Array(cols).fill('---').join(' | ') + ' |';
  const dataRow  = '| ' + Array(cols).fill('Cell').join(' | ') + ' |';
  const dataRows = Math.max(1, rows - 1);
  const block    = '\n' + [header, sep, ...Array(dataRows).fill(dataRow)].join('\n') + '\n';
  applySnippet({ block });
}

// ── File tree ──────────────────────────────────────────────────────────
let dirHandle = null;

document.getElementById('btn-open-folder')?.addEventListener('click', openFolder);
document.getElementById('btn-tree-close')?.addEventListener('click', () => {
  document.getElementById('file-tree').hidden = true;
  document.getElementById('tree-divider').hidden = true;
});
document.getElementById('btn-tree-refresh')?.addEventListener('click', () => {
  if (dirHandle) renderFileTree();
});

async function openFolder() {
  if (!window.showDirectoryPicker) { showMsg('Directory picker not supported in this browser', true); return; }
  try {
    dirHandle = await window.showDirectoryPicker();
    document.getElementById('file-tree').hidden = false;
    document.getElementById('tree-divider').hidden = false;
    await renderFileTree();
  } catch (e) {
    if (e.name !== 'AbortError') showMsg('Could not open folder', true);
  }
}

async function renderFileTree() {
  if (!dirHandle) return;
  document.getElementById('file-tree-name').textContent = dirHandle.name;
  const container = document.getElementById('file-tree-content');
  container.innerHTML = '';
  container.appendChild(await buildTreeNode(dirHandle, 0));
}

async function buildTreeNode(handle, depth) {
  const ul = document.createElement('ul');
  ul.className = 'ft-list';
  const entries = [];
  try {
    for await (const entry of handle.values()) entries.push(entry);
  } catch (_) { return ul; }
  entries.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const entry of entries) {
    const li = document.createElement('li');
    if (entry.kind === 'directory' && depth < 3) {
      const btn = document.createElement('button');
      btn.className   = 'ft-dir';
      btn.textContent = '▶ ' + entry.name;
      const sub = document.createElement('div');
      sub.className = 'ft-subtree';
      sub.hidden    = true;
      let loaded = false;
      btn.addEventListener('click', async () => {
        sub.hidden = !sub.hidden;
        if (!loaded && !sub.hidden) {
          loaded = true;
          sub.appendChild(await buildTreeNode(entry, depth + 1));
        }
        btn.textContent = (sub.hidden ? '▶ ' : '▼ ') + entry.name;
      });
      li.appendChild(btn);
      li.appendChild(sub);
    } else if (entry.kind === 'file' && /\.(md|markdown|yml|yaml|json|jsonc|htm|html|txt)$/i.test(entry.name)) {
      const btn = document.createElement('button');
      btn.className   = 'ft-file';
      btn.textContent = entry.name;
      btn.title       = entry.name;
      btn.addEventListener('click', async () => {
        try {
          const file = await entry.getFile();
          const text = await file.text();
          const lname = file.name.toLowerCase();
          const existing = tabs.find(t => t.name === file.name && !t.isDirty);
          if (existing) { existing.content = text; existing.fileHandle = entry; switchTab(existing.id); return; }
          if (lname.endsWith('.yml') || lname.endsWith('.yaml')) {
            createYamlTab(file.name, text, entry);
          } else if (lname.endsWith('.json') || lname.endsWith('.jsonc')) {
            createJsonTab(file.name, text, entry);
          } else if (lname.endsWith('.htm') || lname.endsWith('.html')) {
            createHtmlTab(file.name, text, entry);
          } else if (lname.endsWith('.txt')) {
            createPlainTextTab(file.name, text, entry);
          } else {
            createTab(file.name, text, entry);
          }
        } catch (_) { showMsg(`Could not open ${entry.name}`, true); }
      });
      li.appendChild(btn);
    }
    if (li.hasChildNodes()) ul.appendChild(li);
  }
  return ul;
}

// ── Public API ─────────────────────────────────────────────────────────
window.SD = {
  editor: editorEl,
  schedulePreview,
  isWysiwyg,
  activeTab,
  insertMermaid(src, sourceTabId, sourceMdId) {
    if (!sourceTabId) {
      // No source tab — insert into active markdown tab or create one
      const mdTab = tabs.find(t => t.type !== 'mermaid' && t.id === activeId)
        || tabs.find(t => t.type !== 'mermaid');
      if (!mdTab) { showMsg('No markdown tab to insert into', true); return; }
      switchTab(mdTab.id);
      const block = `\n\`\`\`mermaid\n${src}\n\`\`\`\n`;
      const pos   = editorEl.selectionStart;
      editorEl.value = editorEl.value.substring(0, pos) + block + editorEl.value.substring(pos);
      markDirty(); schedulePreview(); showMsg('Diagram inserted');
      return;
    }
    const mdTab = tabs.find(t => t.id === sourceTabId);
    if (!mdTab) { showMsg('Source tab not found', true); return; }
    // Replace the nth mermaid block in the source tab's content
    let count = -1;
    const updated = mdTab.content.replace(
      /```mermaid\n([\s\S]*?)```/g,
      (match) => {
        count++;
        return count === sourceMdId
          ? `\`\`\`mermaid\n${src}\n\`\`\``
          : match;
      }
    );
    mdTab.content = updated;
    mdTab.isDirty = true;
    // If source tab is active, update editor
    if (activeId === sourceTabId) {
      editorEl.value = updated;
      schedulePreview();
    }
    showMsg('Diagram updated in source tab');
    renderTabs();
  },
};

})();
