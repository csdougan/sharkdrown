'use strict';

(function () {

const CONDITIONS = [
  { value: 'contains',         label: 'contains' },
  { value: 'not_contains',     label: 'does not contain' },
  { value: 'equals',           label: 'equals' },
  { value: 'not_equals',       label: 'does not equal' },
  { value: 'begins_with',      label: 'begins with' },
  { value: 'not_begins_with',  label: 'does not begin with' },
  { value: 'ends_with',        label: 'ends with' },
  { value: 'not_ends_with',    label: 'does not end with' },
];

const filterBar    = document.getElementById('filter-bar');
const filterRows   = document.getElementById('filter-rows');
const filterStatus = document.getElementById('filter-status');
const btnFilter    = document.getElementById('btn-filter');
const btnAdd       = document.getElementById('filter-add');
const btnClear     = document.getElementById('filter-clear');

const editor = window.SD.editor;

let isOpen    = false;
let logic     = 'and';  // 'and' | 'or'
let debounce  = null;
let savedContent = null;  // original content while filter active
let rowSeq    = 0;

// ── Open / close ───────────────────────────────────────────────────────
btnFilter.addEventListener('click', () => {
  if (isOpen) deactivate();
  else activate();
});

function activate() {
  isOpen = true;
  filterBar.classList.add('open');
  filterBar.setAttribute('aria-hidden', 'false');
  btnFilter.classList.add('active');
  btnFilter.setAttribute('aria-pressed', 'true');
  btnFilter.setAttribute('aria-expanded', 'true');
  if (filterRows.children.length === 0) addRow();
  filterRows.querySelector('.fb-input')?.focus();
  applyFilter();
}

function deactivate() {
  isOpen = false;
  filterBar.classList.remove('open');
  filterBar.setAttribute('aria-hidden', 'true');
  btnFilter.classList.remove('active');
  btnFilter.setAttribute('aria-pressed', 'false');
  btnFilter.setAttribute('aria-expanded', 'false');
  restoreEditor();
}

btnClear.addEventListener('click', deactivate);

// ── Logic toggle ───────────────────────────────────────────────────────
document.querySelectorAll('.fb-logic').forEach(btn => {
  btn.addEventListener('click', () => {
    logic = btn.dataset.logic;
    document.querySelectorAll('.fb-logic').forEach(b => {
      b.classList.toggle('active', b.dataset.logic === logic);
      b.setAttribute('aria-pressed', b.dataset.logic === logic);
    });
    scheduleFilter();
  });
});

// ── Add row ────────────────────────────────────────────────────────────
btnAdd.addEventListener('click', () => { addRow(); scheduleFilter(); });

function addRow() {
  const id  = ++rowSeq;
  const row = document.createElement('div');
  row.className    = 'fb-row';
  row.dataset.rowId = id;

  const sel = document.createElement('select');
  sel.className = 'fb-condition';
  sel.setAttribute('aria-label', 'Filter condition');
  CONDITIONS.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.value; opt.textContent = c.label;
    sel.appendChild(opt);
  });

  const inp = document.createElement('input');
  inp.type        = 'text';
  inp.className   = 'fb-input';
  inp.placeholder = 'filter string…';
  inp.setAttribute('aria-label', 'Filter string');

  const rm = document.createElement('button');
  rm.className   = 'fb-remove';
  rm.textContent = '✕';
  rm.setAttribute('aria-label', 'Remove filter row');
  rm.addEventListener('click', () => {
    row.remove();
    if (filterRows.children.length === 0) {
      restoreEditor();
      filterStatus.textContent = '';
    } else {
      scheduleFilter();
    }
  });

  sel.addEventListener('change', scheduleFilter);
  inp.addEventListener('input',  scheduleFilter);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Escape') deactivate();
  });

  row.appendChild(sel);
  row.appendChild(inp);
  row.appendChild(rm);
  filterRows.appendChild(row);
  inp.focus();
  return row;
}

// ── Filter logic ───────────────────────────────────────────────────────
function scheduleFilter() {
  clearTimeout(debounce);
  debounce = setTimeout(applyFilter, 250);
}

function getRowConditions() {
  return [...filterRows.querySelectorAll('.fb-row')].map(row => ({
    condition: row.querySelector('.fb-condition').value,
    value:     row.querySelector('.fb-input').value,
  })).filter(r => r.value !== '');
}

function testLine(line, condition, value) {
  const a = line;
  const b = value;
  switch (condition) {
    case 'contains':        return a.includes(b);
    case 'not_contains':    return !a.includes(b);
    case 'equals':          return a === b;
    case 'not_equals':      return a !== b;
    case 'begins_with':     return a.startsWith(b);
    case 'not_begins_with': return !a.startsWith(b);
    case 'ends_with':       return a.endsWith(b);
    case 'not_ends_with':   return !a.endsWith(b);
    default:                return true;
  }
}

function applyFilter() {
  if (!isOpen) return;

  const conditions = getRowConditions();

  // No active conditions — restore but keep bar open
  if (conditions.length === 0) {
    restoreEditor();
    filterStatus.textContent = '';
    return;
  }

  // Save original if not already saved
  if (savedContent === null) savedContent = editor.value;

  const lines   = savedContent.split('\n');
  const matched = lines.filter(line => {
    if (logic === 'and') return conditions.every(c => testLine(line, c.condition, c.value));
    else                 return conditions.some(c  => testLine(line, c.condition, c.value));
  });

  // Show filtered content as read-only
  editor.value    = matched.join('\n');
  editor.readOnly = true;
  editor.classList.add('filter-active');
  filterStatus.textContent = `${matched.length} / ${lines.length} lines`;

  // Notify editor.js that content changed (for preview update) without marking dirty
  editor.dispatchEvent(new CustomEvent('filter-applied'));
}

function restoreEditor() {
  if (savedContent !== null) {
    editor.value    = savedContent;
    savedContent    = null;
  }
  editor.readOnly = false;
  editor.classList.remove('filter-active');
  filterStatus.textContent = '';
  editor.dispatchEvent(new CustomEvent('filter-cleared'));
}

// ── Keyboard shortcut — Escape deactivates ─────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && isOpen) deactivate();
});

// ── When editor content changes externally (new tab, open file) ────────
// expose a reset so editor.js can call it on tab switch
window.SD_filter = {
  reset() {
    if (!isOpen) return;
    deactivate();
  },
  isActive() { return isOpen; },
};

})();
