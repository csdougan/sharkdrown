'use strict';

(function () {

const editor         = window.SD.editor;
const schedulePreview = window.SD.schedulePreview;

// ── Panel open/close ───────────────────────────────────────────────────
const panel     = document.getElementById('transform-panel');
const btnToggle = document.getElementById('btn-transform');
const btnClose  = document.getElementById('tp-close');

btnToggle.addEventListener('click', () => {
  const opening = !panel.classList.contains('is-open');
  panel.classList.toggle('is-open', opening);
  btnToggle.setAttribute('aria-expanded', String(opening));
});

btnClose.addEventListener('click', () => {
  panel.classList.remove('is-open');
  btnToggle.setAttribute('aria-expanded', 'false');
});

// ── Tab switching ──────────────────────────────────────────────────────
document.querySelectorAll('.tp-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tp-tab').forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    document.querySelectorAll('.tp-pane').forEach(p => p.classList.add('tp-pane--hidden'));

    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    document.getElementById(`tp-${tab.dataset.tab}`).classList.remove('tp-pane--hidden');
  });
});

// ── Shared helpers ─────────────────────────────────────────────────────
const selectionOnly = document.getElementById('tp-selection-only');

function getTarget() {
  if (selectionOnly.checked) {
    const start = editor.selectionStart;
    const end   = editor.selectionEnd;
    if (start !== end) {
      return { text: editor.value.substring(start, end), mode: 'selection', start, end };
    }
  }
  return { text: editor.value, mode: 'full' };
}

function applyResult(result, target) {
  if (target.mode === 'selection') {
    editor.value = (
      editor.value.substring(0, target.start) +
      result +
      editor.value.substring(target.end)
    );
    editor.selectionStart = target.start;
    editor.selectionEnd   = target.start + result.length;
  } else {
    const scrollTop = editor.scrollTop;
    editor.value = result;
    editor.scrollTop = scrollTop;
  }
  editor.dispatchEvent(new Event('input'));
}

function applyToLines(text, fn, skipEmpty = false) {
  return text.split('\n').map(line => (skipEmpty && line.trim() === '') ? line : fn(line)).join('\n');
}

// ── 1. Prefix / Suffix ─────────────────────────────────────────────────
document.getElementById('btn-ps-add').addEventListener('click', () => {
  const prefix    = document.getElementById('ps-add-prefix').value;
  const suffix    = document.getElementById('ps-add-suffix').value;
  const skipEmpty = document.getElementById('ps-add-skip-empty').checked;
  if (!prefix && !suffix) return;
  const target = getTarget();
  applyResult(applyToLines(target.text, line => `${prefix}${line}${suffix}`, skipEmpty), target);
});

document.getElementById('btn-ps-remove').addEventListener('click', () => {
  const prefix = document.getElementById('ps-rm-prefix').value;
  const suffix = document.getElementById('ps-rm-suffix').value;
  const all    = document.getElementById('ps-rm-all').checked;
  if (!prefix && !suffix) return;
  const target = getTarget();
  const result = applyToLines(target.text, line => {
    let l = line;
    if (prefix && l.startsWith(prefix)) {
      if (all) { while (l.startsWith(prefix)) l = l.slice(prefix.length); }
      else l = l.slice(prefix.length);
    }
    if (suffix && l.endsWith(suffix)) {
      if (all) { while (l.endsWith(suffix)) l = l.slice(0, l.length - suffix.length); }
      else l = l.slice(0, l.length - suffix.length);
    }
    return l;
  });
  applyResult(result, target);
});

// ── 2. Find / Replace ──────────────────────────────────────────────────
const frError = document.getElementById('fr-error');
const frInfo  = document.getElementById('fr-info');

function buildFindRegex(raw, caseSensitive, replaceAll) {
  frError.textContent = '';
  const reMatch = raw.match(/^\/(.+)\/([gimsuy]*)$/);
  if (reMatch) {
    try {
      let flags = reMatch[2] || '';
      if (replaceAll && !flags.includes('g')) flags += 'g';
      if (!caseSensitive && !flags.includes('i')) flags += 'i';
      return new RegExp(reMatch[1], flags);
    } catch (e) {
      frError.textContent = `Regex error: ${e.message}`;
      return null;
    }
  }
  let flags = replaceAll ? 'g' : '';
  if (!caseSensitive) flags += 'i';
  return new RegExp(raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
}

document.getElementById('btn-fr-apply').addEventListener('click', () => {
  frError.textContent = '';
  frInfo.textContent  = '';
  const raw     = document.getElementById('fr-find').value;
  const replace = document.getElementById('fr-replace').value;
  const caseSen = document.getElementById('fr-case').checked;
  const all     = document.getElementById('fr-all').checked;
  if (!raw) return;
  const re = buildFindRegex(raw, caseSen, all);
  if (!re) return;
  const target = getTarget();
  let count = 0;
  const result = target.text.replace(re, (...args) => {
    count++;
    return replace.replace(/\$(\d+)/g, (_, n) => args[parseInt(n)] ?? '');
  });
  applyResult(result, target);
  frInfo.textContent = `${count} replacement${count !== 1 ? 's' : ''} made`;
});

// ── 3. Fields ──────────────────────────────────────────────────────────
const fldError = document.getElementById('fld-error');

function parseFieldSpec(spec, totalFields) {
  fldError.textContent = '';
  const indices = new Set();
  for (const part of spec.split(',')) {
    const rangeMatch = part.trim().match(/^(-?\d+)-(-?\d+)$/);
    if (rangeMatch) {
      let a = parseInt(rangeMatch[1]);
      let b = parseInt(rangeMatch[2]);
      if (a < 0) a = totalFields + a + 1;
      if (b < 0) b = totalFields + b + 1;
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) indices.add(i);
    } else {
      let n = parseInt(part.trim());
      if (isNaN(n)) { fldError.textContent = `Invalid field spec: "${part.trim()}"`; return null; }
      if (n < 0) n = totalFields + n + 1;
      indices.add(n);
    }
  }
  return indices;
}

document.getElementById('btn-fld-apply').addEventListener('click', () => {
  fldError.textContent = '';
  const delimIn   = document.getElementById('fld-delim-in').value;
  const delimOut  = document.getElementById('fld-delim-out').value;
  const fieldSpec = document.getElementById('fld-fields').value.trim();
  const useRegex  = document.getElementById('fld-delim-regex').checked;
  const modeRm    = document.getElementById('fld-mode-remove').checked;
  const skipEmpty = document.getElementById('fld-skip-empty').checked;
  if (!delimIn)   { fldError.textContent = 'Input delimiter required'; return; }
  if (!fieldSpec) { fldError.textContent = 'Field specification required'; return; }
  let splitter;
  if (useRegex) {
    try { splitter = new RegExp(delimIn); }
    catch (e) { fldError.textContent = `Regex error: ${e.message}`; return; }
  } else {
    splitter = delimIn;
  }
  const target = getTarget();
  const result = applyToLines(target.text, line => {
    if (skipEmpty && line.trim() === '') return line;
    const parts = line.split(splitter);
    const total = parts.length;
    const indices = parseFieldSpec(fieldSpec, total);
    if (!indices) return line;
    let kept;
    if (modeRm) {
      kept = parts.filter((_, i) => !indices.has(i + 1));
    } else {
      const ordered = [...indices].filter(n => n >= 1 && n <= total).sort((a, b) => a - b);
      kept = ordered.map(n => parts[n - 1]);
    }
    return kept.join(delimOut);
  });
  applyResult(result, target);
});

// ── 4. Whitespace ──────────────────────────────────────────────────────
function wsOp(fn) {
  const target = getTarget();
  applyResult(fn(target.text), target);
}

document.getElementById('btn-ws-ltrim').addEventListener('click',      () => wsOp(t => applyToLines(t, l => l.replace(/^[\t ]+/, ''))));
document.getElementById('btn-ws-rtrim').addEventListener('click',      () => wsOp(t => applyToLines(t, l => l.replace(/[\t ]+$/, ''))));
document.getElementById('btn-ws-trim').addEventListener('click',       () => wsOp(t => applyToLines(t, l => l.trim())));
document.getElementById('btn-ws-collapse').addEventListener('click',   () => wsOp(t => applyToLines(t, l => l.replace(/[ \t]+/g, ' '))));
document.getElementById('btn-ws-blank').addEventListener('click',      () => wsOp(t => t.split('\n').filter(l => l.trim() !== '').join('\n')));
document.getElementById('btn-ws-dedup-blank').addEventListener('click', () => {
  wsOp(t => {
    const out = [];
    let prevBlank = false;
    for (const line of t.split('\n')) {
      const blank = line.trim() === '';
      if (blank && prevBlank) continue;
      out.push(line);
      prevBlank = blank;
    }
    return out.join('\n');
  });
});

// ── 5. Control characters ──────────────────────────────────────────────
const CC_MAP = {
  cr:   { re: /\r/g,       glyph: '␍' },
  bom:  { re: /\uFEFF/g,   glyph: '[BOM]' },
  nul:  { re: /\x00/g,     glyph: '␀' },
  bell: { re: /\x07/g,     glyph: '␇' },
  bs:   { re: /\x08/g,     glyph: '␈' },
  vt:   { re: /\x0B/g,     glyph: '␋' },
  ff:   { re: /\x0C/g,     glyph: '␌' },
  esc:  { re: /\x1B/g,     glyph: '␛' },
  del:  { re: /\x7F/g,     glyph: '␡' },
  nbsp: { re: /\xA0/g,     glyph: '·' },
  zwsp: { re: /\u200B/g,   glyph: '[ZWSP]' },
  zwnj: { re: /\u200C/g,   glyph: '[ZWNJ]' },
};

const ccReport = document.getElementById('cc-report');

document.getElementById('btn-cc-show').addEventListener('click', () => {
  const target = getTarget();
  let text = target.text;
  const found = [];
  for (const [key, { re, glyph }] of Object.entries(CC_MAP)) {
    const matches = text.match(re);
    if (matches) {
      found.push(`${key.toUpperCase().padEnd(6)} × ${matches.length}  →  ${glyph}`);
      text = text.replace(re, glyph);
    }
  }
  if (found.length === 0) {
    ccReport.textContent = 'No control characters found.';
  } else {
    ccReport.textContent = found.join('\n');
    applyResult(text, target);
  }
});

document.getElementById('btn-cc-remove').addEventListener('click', () => {
  const checked = [...document.querySelectorAll('#cc-checkboxes input:checked')];
  if (!checked.length) return;
  const target = getTarget();
  let text = target.text;
  let total = 0;
  for (const cb of checked) {
    const { re } = CC_MAP[cb.dataset.cc];
    const matches = text.match(re);
    if (matches) total += matches.length;
    text = text.replace(re, '');
  }
  applyResult(text, target);
  ccReport.textContent = `Removed ${total} character${total !== 1 ? 's' : ''}.`;
});

})();
