'use strict';

(function () {

const lintPane      = document.getElementById('lint-pane');
const lintDivider   = document.getElementById('lint-divider');
const lintBody      = document.getElementById('lint-body');
const lintTitle     = document.getElementById('lint-title');
const btnLintClose  = document.getElementById('btn-lint-close');
const btnLintFixAll = document.getElementById('btn-lint-fix-all');
const btnLint       = document.getElementById('btn-lint');

// Default height for lint pane: ~33% of pane-code height
const DEFAULT_HEIGHT_RATIO = 0.33;
let lintHeight = null;  // px — null means use default on first open

let currentIssues = [];
let hasFixable    = false;

// ── Open / close ───────────────────────────────────────────────────────
function openPane() {
  const paneCode = document.getElementById('pane-code');
  if (!lintHeight) {
    lintHeight = Math.max(80, Math.round(paneCode.getBoundingClientRect().height * DEFAULT_HEIGHT_RATIO));
  }
  lintPane.style.height    = lintHeight + 'px';
  lintPane.hidden          = false;
  lintDivider.hidden       = false;
  btnLint.setAttribute('aria-expanded', 'true');
  btnLint.classList.add('active');
}

function closePane() {
  lintPane.hidden    = true;
  lintDivider.hidden = true;
  btnLint.setAttribute('aria-expanded', 'false');
  btnLint.classList.remove('active');
}

btnLintClose.addEventListener('click', closePane);

// ── Drag-to-resize divider ─────────────────────────────────────────────
(function initDivider() {
  let dragging = false, startY, startH;

  lintDivider.addEventListener('mousedown', e => {
    dragging = true;
    startY   = e.clientY;
    startH   = lintPane.getBoundingClientRect().height;
    lintDivider.classList.add('dragging');
    document.body.style.cssText += ';cursor:row-resize;user-select:none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const delta  = startY - e.clientY;   // drag up = increase height
    const paneH  = document.getElementById('pane-code').getBoundingClientRect().height;
    lintHeight   = Math.min(Math.max(startH + delta, 60), paneH - 80);
    lintPane.style.height = lintHeight + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    lintDivider.classList.remove('dragging');
    document.body.style.cursor     = '';
    document.body.style.userSelect = '';
  });
})();

// ── Render issues ──────────────────────────────────────────────────────
function renderIssues(issues) {
  currentIssues = issues;
  hasFixable    = issues.some(i => i.fixable);
  lintBody.innerHTML = '';

  if (issues.length === 0) {
    const el = document.createElement('div');
    el.className   = 'lint-empty';
    el.textContent = 'No issues found.';
    lintBody.appendChild(el);
    lintTitle.textContent = 'Lint Results — No issues';
    btnLintFixAll.hidden = true;
    return;
  }

  lintTitle.textContent = `Lint Results — ${issues.length} issue${issues.length !== 1 ? 's' : ''}`;
  btnLintFixAll.hidden  = !hasFixable;

  issues.forEach((issue, idx) => {
    const row = document.createElement('div');
    row.className = 'lint-issue';
    row.dataset.idx = idx;

    const pos = document.createElement('span');
    pos.className   = 'lint-pos';
    pos.textContent = `${issue.line}:${issue.col}`;

    const rule = document.createElement('span');
    rule.className   = 'lint-rule';
    rule.textContent = issue.rule;

    const msg = document.createElement('span');
    msg.className   = 'lint-msg';
    msg.textContent = issue.message;
    msg.title       = issue.message;

    row.appendChild(pos);
    row.appendChild(rule);
    row.appendChild(msg);

    if (issue.fixable) {
      const fixBtn = document.createElement('button');
      fixBtn.className   = 'lint-fix-btn';
      fixBtn.textContent = `Fix ${issue.rule}`;
      fixBtn.title       = `Apply all auto-fixes for ${issue.rule}`;
      fixBtn.addEventListener('click', e => {
        e.stopPropagation();
        applyFix(issue.rule);
      });
      row.appendChild(fixBtn);
    } else {
      const badge = document.createElement('span');
      badge.className   = 'lint-manual-badge';
      badge.textContent = 'manual';
      badge.title       = 'This rule cannot be auto-fixed';
      row.appendChild(badge);
    }

    row.addEventListener('click', () => {
      document.querySelectorAll('.lint-issue.selected').forEach(el => el.classList.remove('selected'));
      row.classList.add('selected');
      navigateTo(issue.line, issue.col);
    });

    lintBody.appendChild(row);
  });
}

// ── Navigate editor to line:col ────────────────────────────────────────
function navigateTo(line, col) {
  const editor = window.SD?.editor;
  if (!editor) return;
  const lines  = editor.value.split('\n');
  let pos = 0;
  for (let i = 0; i < Math.min(line - 1, lines.length); i++) {
    pos += lines[i].length + 1;   // +1 for \n
  }
  pos += Math.max(0, col - 1);
  editor.focus();
  editor.selectionStart = pos;
  editor.selectionEnd   = pos;

  // Scroll the line into view
  const lineH    = parseFloat(getComputedStyle(editor).lineHeight) || 23.625;
  const targetST = Math.max(0, (line - 3) * lineH);
  editor.scrollTop = targetST;
}

// ── Apply fix ──────────────────────────────────────────────────────────
async function applyFix(rule) {
  const editor = window.SD?.editor;
  if (!editor) return;
  const content = editor.value;
  try {
    const res  = await fetch('/api/lint/fix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, rule: rule || null }),
    });
    const data = await res.json();
    if (data.error) { showLintError(data.error); return; }
    // Apply the fixed content to the editor
    editor.value = data.content;
    editor.dispatchEvent(new Event('input'));
    // Re-run lint on the updated content
    runLint();
  } catch (e) {
    showLintError('Fix request failed');
  }
}

function showLintError(msg) {
  lintBody.innerHTML = '';
  const el = document.createElement('div');
  el.className   = 'lint-error-msg';
  el.textContent = msg;
  lintBody.appendChild(el);
}

// ── Run lint ───────────────────────────────────────────────────────────
async function runLint() {
  const editor = window.SD?.editor;
  if (!editor) return;

  // Switch to code view if in split or wysiwyg
  const ws = document.getElementById('workspace');
  const isCodeView = ws.classList.contains('view-code');
  if (!isCodeView) {
    document.querySelector('.view-btn[data-view="code"]')?.click();
  }

  openPane();
  lintTitle.textContent = 'Lint Results — running…';
  lintBody.innerHTML    = '';
  btnLintFixAll.hidden  = true;

  try {
    const res  = await fetch('/api/lint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: editor.value }),
    });
    const data = await res.json();
    if (data.error) { showLintError(data.error); return; }
    renderIssues(data.issues);
  } catch (e) {
    showLintError('Lint request failed — is the server running?');
  }
}

// ── Wire up buttons ────────────────────────────────────────────────────
btnLint.addEventListener('click', () => {
  if (!lintPane.hidden) {
    closePane();
  } else {
    runLint();
  }
});

btnLintFixAll.addEventListener('click', () => applyFix(null));

})();
