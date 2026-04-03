'use strict';

// ── Mermaid visual editor ──────────────────────────────────────────────
// Exposed as window.MermaidEditor — called by editor.js

window.MermaidEditor = (function () {

// ── Diagram type definitions ───────────────────────────────────────────
const DIAGRAM_TYPES = {
  flowchart: {
    label: 'Flowchart',
    header: 'flowchart TD',
    shapes: [
      { id: 'rect',       label: 'Rectangle',        preview: '▬', mermaid: (id,lbl) => `${id}[${lbl}]` },
      { id: 'round',      label: 'Rounded Rect',      preview: '▢', mermaid: (id,lbl) => `${id}(${lbl})` },
      { id: 'stadium',    label: 'Stadium',            preview: '⬭', mermaid: (id,lbl) => `${id}([${lbl}])` },
      { id: 'subroutine', label: 'Subroutine',         preview: '▣', mermaid: (id,lbl) => `${id}[[${lbl}]]` },
      { id: 'diamond',    label: 'Rhombus',            preview: '◇', mermaid: (id,lbl) => `${id}{${lbl}}` },
      { id: 'hex',        label: 'Hexagon',            preview: '⬡', mermaid: (id,lbl) => `${id}{{${lbl}}}` },
      { id: 'circle',     label: 'Circle',             preview: '○', mermaid: (id,lbl) => `${id}((${lbl}))` },
      { id: 'ellipse',    label: 'Ellipse',            preview: '⊙', mermaid: (id,lbl) => `${id}((${lbl}))` },
      { id: 'db',         label: 'Database',           preview: '⌗', mermaid: (id,lbl) => `${id}[(${lbl})]` },
      { id: 'asymmetric', label: 'Asymmetric',         preview: '▷', mermaid: (id,lbl) => `${id}>${lbl}]` },
      { id: 'para',       label: 'Parallelogram',      preview: '▱', mermaid: (id,lbl) => `${id}[/${lbl}/]` },
      { id: 'para_alt',   label: 'Parallelogram Alt',  preview: '▰', mermaid: (id,lbl) => `${id}[\\${lbl}\\]` },
      { id: 'trapezoid',  label: 'Trapezoid',          preview: '⏢', mermaid: (id,lbl) => `${id}[/${lbl}\\]` },
      { id: 'trap_alt',   label: 'Trapezoid Alt',      preview: '⏣', mermaid: (id,lbl) => `${id}[\\${lbl}/]` },
      { id: 'dbl_circle', label: 'Double Circle',      preview: '◎', mermaid: (id,lbl) => `${id}(((${lbl})))` },
    ],
    edgeTypes: [
      { id: 'arrow',   label: '→ Arrow',       syntax: '-->' },
      { id: 'dotted',  label: '⇢ Dotted',      syntax: '-.->' },
      { id: 'thick',   label: '⟹ Thick',       syntax: '==>' },
      { id: 'open',    label: '— Open',         syntax: '---' },
    ],
  },
  sequence: {
    label: 'Sequence',
    header: 'sequenceDiagram',
    shapes: [
      { id: 'participant',  label: 'Participant',   preview: '▭',  mermaid: (id,lbl) => `participant ${id} as ${lbl}` },
      { id: 'actor',        label: 'Actor',         preview: '☺',  mermaid: (id,lbl) => `actor ${id} as ${lbl}` },
      { id: 'boundary',     label: 'Boundary',      preview: '⊕',  mermaid: (id,lbl) => `participant ${id} <<boundary>> as ${lbl}` },
      { id: 'control',      label: 'Control',       preview: '⟳',  mermaid: (id,lbl) => `participant ${id} <<control>> as ${lbl}` },
      { id: 'entity',       label: 'Entity',        preview: '▣',  mermaid: (id,lbl) => `participant ${id} <<entity>> as ${lbl}` },
      { id: 'database',     label: 'Database',      preview: '⌗',  mermaid: (id,lbl) => `participant ${id} <<database>> as ${lbl}` },
      { id: 'collections',  label: 'Collections',   preview: '⊞',  mermaid: (id,lbl) => `participant ${id} <<collections>> as ${lbl}` },
      { id: 'queue',        label: 'Queue',         preview: '⊏',  mermaid: (id,lbl) => `participant ${id} <<queue>> as ${lbl}` },
    ],
    edgeTypes: [
      { id: 'solid_arrow',    label: '->> Arrow',       syntax: '->>' },
      { id: 'dotted_arrow',   label: '-->> Dotted',      syntax: '-->>' },
      { id: 'solid_open',     label: '-> Open',           syntax: '->' },
      { id: 'dotted_open',    label: '--> Open dotted',  syntax: '-->' },
      { id: 'solid_cross',    label: '-x Cross',         syntax: '-x' },
      { id: 'dotted_cross',   label: '--x Dotted cross', syntax: '--x' },
      { id: 'async',          label: '-) Async',         syntax: '-)' },
      { id: 'async_dotted',   label: '--) Async dotted', syntax: '--)' },
      { id: 'bidir',          label: '<<->> Bidir',      syntax: '<<->>' },
    ],
  },
  state: {
    label: 'State',
    header: 'stateDiagram-v2',
    shapes: [
      { id: 'state',   label: 'State',          preview: '▭', mermaid: (id,lbl) => `${id}: ${lbl}` },
      { id: 'start',   label: 'Start',          preview: '●', mermaid: (id,_)   => `[*]` },
      { id: 'end',     label: 'End',            preview: '⊙', mermaid: (id,_)   => `[*]` },
      { id: 'choice',  label: 'Choice',         preview: '◇', mermaid: (id,lbl) => `state ${lbl} <<choice>>` },
      { id: 'fork',    label: 'Fork',           preview: '⊣', mermaid: (id,lbl) => `state ${lbl} <<fork>>` },
    ],
    edgeTypes: [
      { id: 'trans',   label: '→ Transition',   syntax: '-->' },
      { id: 'labeled', label: '→ Labeled',      syntax: '-->' },
    ],
  },
  er: {
    label: 'ER Diagram',
    header: 'erDiagram',
    shapes: [
      { id: 'entity',  label: 'Entity',         preview: '▭', mermaid: (id,lbl) => `${lbl} {` },
    ],
    edgeTypes: [
      { id: 'one_one',   label: '|o--o|',       syntax: '|o--o|' },
      { id: 'one_many',  label: '|o--|{',        syntax: '||--o{' },
      { id: 'many_many', label: '}|--|{',        syntax: '}|--|{' },
      { id: 'zero_one',  label: 'o|--||',        syntax: 'o|--||' },
    ],
  },
  expanded_flowchart: {
    label: 'Flowchart (Ext)',
    header: 'flowchart TD',
    shapes: [
      { id: 'ef_proc',      label: 'Process',          preview: '▬', mermaid: (id,lbl) => `${id}@{ shape: rect, label: "${lbl}" }` },
      { id: 'ef_decision',  label: 'Decision',         preview: '◇', mermaid: (id,lbl) => `${id}@{ shape: diam, label: "${lbl}" }` },
      { id: 'ef_db',        label: 'Database',         preview: '⌗', mermaid: (id,lbl) => `${id}@{ shape: cyl, label: "${lbl}" }` },
      { id: 'ef_event',     label: 'Event',            preview: '▢', mermaid: (id,lbl) => `${id}@{ shape: rounded, label: "${lbl}" }` },
      { id: 'ef_terminal',  label: 'Terminal',         preview: '⬭', mermaid: (id,lbl) => `${id}@{ shape: stadium, label: "${lbl}" }` },
      { id: 'ef_doc',       label: 'Document',         preview: '📄', mermaid: (id,lbl) => `${id}@{ shape: doc, label: "${lbl}" }` },
      { id: 'ef_circle',    label: 'Circle/Start',     preview: '○', mermaid: (id,lbl) => `${id}@{ shape: circle, label: "${lbl}" }` },
      { id: 'ef_dbl',       label: 'Double Circle/End',preview: '◎', mermaid: (id,lbl) => `${id}@{ shape: dbl-circ, label: "${lbl}" }` },
      { id: 'ef_hex',       label: 'Hexagon',          preview: '⬡', mermaid: (id,lbl) => `${id}@{ shape: hex, label: "${lbl}" }` },
      { id: 'ef_tri',       label: 'Triangle',         preview: '△', mermaid: (id,lbl) => `${id}@{ shape: tri, label: "${lbl}" }` },
      { id: 'ef_hourglass', label: 'Hourglass',        preview: '⧗', mermaid: (id,lbl) => `${id}@{ shape: hourglass, label: "${lbl}" }` },
      { id: 'ef_bolt',      label: 'Bolt',             preview: '⚡', mermaid: (id,lbl) => `${id}@{ shape: bolt, label: "${lbl}" }` },
      { id: 'ef_lean_r',    label: 'Lean Right',       preview: '▱', mermaid: (id,lbl) => `${id}@{ shape: lean-r, label: "${lbl}" }` },
      { id: 'ef_lean_l',    label: 'Lean Left',        preview: '▰', mermaid: (id,lbl) => `${id}@{ shape: lean-l, label: "${lbl}" }` },
      { id: 'ef_trap_t',    label: 'Trapezoid',        preview: '⏢', mermaid: (id,lbl) => `${id}@{ shape: trap-t, label: "${lbl}" }` },
      { id: 'ef_trap_b',    label: 'Trapezoid Alt',    preview: '⏣', mermaid: (id,lbl) => `${id}@{ shape: trap-b, label: "${lbl}" }` },
      { id: 'ef_manual',    label: 'Manual Input',     preview: '⌨', mermaid: (id,lbl) => `${id}@{ shape: manual-input, label: "${lbl}" }` },
      { id: 'ef_doc2',      label: 'Lined Document',   preview: '📋', mermaid: (id,lbl) => `${id}@{ shape: lin-doc, label: "${lbl}" }` },
      { id: 'ef_notch',     label: 'Notch Rect',       preview: '⬠', mermaid: (id,lbl) => `${id}@{ shape: notch-rect, label: "${lbl}" }` },
      { id: 'ef_bow_tie',   label: 'Bow Tie',          preview: '⧖', mermaid: (id,lbl) => `${id}@{ shape: bow-tie, label: "${lbl}" }` },
      { id: 'ef_odd',       label: 'Odd',              preview: '⬟', mermaid: (id,lbl) => `${id}@{ shape: odd, label: "${lbl}" }` },
    ],
    edgeTypes: [
      { id: 'arrow',   label: '→ Arrow',       syntax: '-->' },
      { id: 'dotted',  label: '⇢ Dotted',      syntax: '-.->' },
      { id: 'thick',   label: '⟹ Thick',       syntax: '==>' },
      { id: 'open',    label: '— Open',         syntax: '---' },
    ],
  },
  class_diagram: {
    label: 'Class',
    header: 'classDiagram',
    shapes: [
      { id: 'class',     label: 'Class',      preview: '▣', mermaid: (id,lbl) => `class ${lbl}` },
      { id: 'interface', label: 'Interface',  preview: '◫', mermaid: (id,lbl) => `class ${lbl} { <<interface>> }` },
      { id: 'abstract',  label: 'Abstract',   preview: '▨', mermaid: (id,lbl) => `class ${lbl} { <<abstract>> }` },
      { id: 'enum',      label: 'Enum',       preview: '≡', mermaid: (id,lbl) => `class ${lbl} { <<enumeration>> }` },
    ],
    edgeTypes: [
      { id: 'inheritance',  label: '<|-- Inheritance',  syntax: '<|--' },
      { id: 'composition',  label: '*-- Composition',   syntax: '*--' },
      { id: 'aggregation',  label: 'o-- Aggregation',   syntax: 'o--' },
      { id: 'association',  label: '--> Association',    syntax: '-->' },
      { id: 'link',         label: '-- Link (solid)',    syntax: '--' },
      { id: 'dependency',   label: '..> Dependency',     syntax: '..>' },
      { id: 'realization',  label: '..|> Realization',   syntax: '..|>' },
      { id: 'dashed',       label: '.. Link (dashed)',   syntax: '..' },
    ],
  },
  journey: {
    label: 'User Journey',
    header: 'journey',
    shapes: [
      { id: 'section', label: 'Section', preview: '≡', mermaid: (id,lbl) => `section ${lbl}` },
      { id: 'task',    label: 'Task',    preview: '▬', mermaid: (id,lbl) => `  ${lbl}: 3: User` },
    ],
    edgeTypes: [],
  },
  c4: {
    label: 'C4 Context',
    header: 'C4Context',
    shapes: [
      { id: 'c4_person',      label: 'Person',          preview: '👤', mermaid: (id,lbl) => `Person(${id}, "${lbl}", "")` },
      { id: 'c4_person_ext',  label: 'Person (Ext)',     preview: '👥', mermaid: (id,lbl) => `Person_Ext(${id}, "${lbl}", "")` },
      { id: 'c4_system',      label: 'System',           preview: '▬', mermaid: (id,lbl) => `System(${id}, "${lbl}", "")` },
      { id: 'c4_system_ext',  label: 'System (Ext)',     preview: '▨', mermaid: (id,lbl) => `System_Ext(${id}, "${lbl}", "")` },
      { id: 'c4_systemdb',    label: 'System DB',        preview: '⌗', mermaid: (id,lbl) => `SystemDb(${id}, "${lbl}", "")` },
      { id: 'c4_systemqueue', label: 'System Queue',     preview: '⊏', mermaid: (id,lbl) => `SystemQueue(${id}, "${lbl}", "")` },
      { id: 'c4_boundary',    label: 'Boundary',         preview: '⬜', mermaid: (id,lbl) => `Boundary(${id}, "${lbl}")` },
    ],
    edgeTypes: [
      { id: 'rel',       label: 'Rel',        syntax: 'Rel' },
      { id: 'birel',     label: 'BiRel',      syntax: 'BiRel' },
      { id: 'rel_up',    label: 'Rel_Up',     syntax: 'Rel_Up' },
      { id: 'rel_down',  label: 'Rel_Down',   syntax: 'Rel_Down' },
      { id: 'rel_left',  label: 'Rel_Left',   syntax: 'Rel_Left' },
      { id: 'rel_right', label: 'Rel_Right',  syntax: 'Rel_Right' },
    ],
  },
};

// ── State ──────────────────────────────────────────────────────────────
let state = {
  diagramType:  'flowchart',
  nodes:        [],   // { id, type, label, x, y, w, h }
  edges:        [],   // { id, from, to, label, edgeType }
  selected:      new Set(),
  selectedEdges: new Set(),
  clipboard:    null,
  connecting:   null, // { fromId } when drawing an edge
  dragging:     null, // { nodeId, startX, startY, origPositions }
  nextId:       1,
  edgeType:     'arrow',
  pendingShape: null, // shape to place on next canvas click
  sourceTabId:  null, // markdown tab this diagram came from
  sourceMdId:   null, // index of mermaid block in that tab
  linkMode:     false, // persistent link-drawing mode
  journeyTitle: 'User Journey',
  c4Title:      'System Context',
};

// DOM refs — set on mount
let svgEl, canvasG, toolbarEl, diagramTypeSelect, edgeTypeSelect, statusEl;
let mountedContainer = null;

// ── Mount / unmount ────────────────────────────────────────────────────
function mount(container) {
  mountedContainer = container;
  container.innerHTML = buildHTML();
  bindDOM(container);
  bindEvents();
  render();
}

function unmount() {
  if (mountedContainer) mountedContainer.innerHTML = '';
  mountedContainer = null;
}

// ── HTML shell ─────────────────────────────────────────────────────────
function buildHTML() {
  return `
<div class="me-shell">
  <div class="me-toolbar" id="me-toolbar">
    <select class="me-select" id="me-diagram-type" aria-label="Diagram type">
      ${Object.entries(DIAGRAM_TYPES).map(([k,v]) => `<option value="${k}">${v.label}</option>`).join('')}
    </select>
    <span class="me-sep"></span>
    <div class="me-shapes" id="me-shapes"></div>
    <span class="me-sep"></span>
    <div class="me-edge-group" id="me-edge-group">
      <span class="me-label">Edge</span>
      <select class="me-select" id="me-edge-type" aria-label="Edge type"></select>
    </div>
    <button class="me-btn me-btn-accent" id="me-btn-link" title="Toggle link mode (L) — click any node to draw a connection"><i class="bi bi-link-45deg"></i> Link</button>
    <span class="me-sep"></span>
    <button class="me-btn" id="me-btn-delete"   title="Delete selected (Del)"><i class="bi bi-trash3"></i></button>
    <button class="me-btn" id="me-btn-clear"    title="Clear all"><i class="bi bi-x-lg"></i> Clear</button>
    <span class="me-sep"></span>
    <button class="me-btn me-btn-accent" id="me-btn-import" title="Import Mermaid syntax"><i class="bi bi-upload"></i> Import</button>
    <button class="me-btn me-btn-accent" id="me-btn-insert" title="Insert into markdown tab"><i class="bi bi-download"></i> Insert</button>
    <span class="me-sep"></span>
    <button class="me-btn" id="me-btn-svg"  title="Export SVG"><i class="bi bi-file-earmark-arrow-down"></i> SVG</button>
    <button class="me-btn" id="me-btn-png"  title="Export PNG"><i class="bi bi-file-earmark-image"></i> PNG</button>
  </div>

  <div class="me-workspace">
    <div class="me-canvas-wrap" id="me-canvas-wrap">
      <svg id="me-svg" xmlns="http://www.w3.org/2000/svg" tabindex="0"
           aria-label="Diagram canvas">
        <defs>
          <marker id="me-arrow" markerWidth="10" markerHeight="7"
                  refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="var(--accent2)" />
          </marker>
          <marker id="me-arrow-sel" markerWidth="10" markerHeight="7"
                  refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="var(--accent)" />
          </marker>
        </defs>
        <g id="me-canvas-g">
          <rect id="me-grid-bg" x="-5000" y="-5000" width="10000" height="10000"
                fill="var(--bg0)" />
        </g>
      </svg>
      <div class="me-drop-hint" id="me-drop-hint">
        Select a shape from the toolbar and click to place — hover a node to see connection handles
      </div>
    </div>

    <div class="me-sidebar" id="me-sidebar">
      <div class="me-sidebar-title">Properties</div>
      <div id="me-props"></div>

      <div class="me-sidebar-title" style="margin-top:16px">Mermaid Source</div>
      <textarea id="me-source" class="me-source-area" spellcheck="false"
                aria-label="Mermaid source"></textarea>
    </div>
  </div>

  <div class="me-status" id="me-status">Ready</div>
</div>`;
}

// ── Bind DOM refs after mount ───────────────────────────────────────────
function bindDOM(container) {
  svgEl           = container.querySelector('#me-svg');
  canvasG         = container.querySelector('#me-canvas-g');
  toolbarEl       = container.querySelector('#me-toolbar');
  diagramTypeSelect = container.querySelector('#me-diagram-type');
  edgeTypeSelect  = container.querySelector('#me-edge-type');
  statusEl        = container.querySelector('#me-status');
  populateShapes(container);
  populateEdgeTypes(container);
  updateToolbarVisibility();
}

function populateShapes(container) {
  const wrap = container.querySelector('#me-shapes');
  const dt   = DIAGRAM_TYPES[state.diagramType];
  wrap.innerHTML = '';
  dt.shapes.forEach(shape => {
    const btn = document.createElement('button');
    btn.className   = 'me-shape-btn';
    btn.title       = shape.label;
    btn.dataset.shape = shape.id;
    btn.textContent = shape.preview;
    btn.addEventListener('click', () => selectPendingShape(shape.id, btn));
    wrap.appendChild(btn);
  });
}

function populateEdgeTypes(container) {
  const dt = DIAGRAM_TYPES[state.diagramType];
  edgeTypeSelect.innerHTML = dt.edgeTypes
    .map(e => `<option value="${e.id}">${e.label}</option>`).join('');
  state.edgeType = dt.edgeTypes[0]?.id || 'arrow';
}

function updateToolbarVisibility() {
  const dt = DIAGRAM_TYPES[state.diagramType];
  const hasEdges = dt.edgeTypes.length > 0;
  const edgeGroup = mountedContainer?.querySelector('#me-edge-group');
  const linkBtn   = mountedContainer?.querySelector('#me-btn-link');
  if (edgeGroup) edgeGroup.style.display = hasEdges ? '' : 'none';
  if (linkBtn)   linkBtn.style.display   = hasEdges ? '' : 'none';
}

// ── Event binding ──────────────────────────────────────────────────────
function bindEvents() {
  diagramTypeSelect.addEventListener('change', () => {
    state.diagramType = diagramTypeSelect.value;
    state.nodes = []; state.edges = []; state.selected.clear();
    state.connecting = null; state.pendingShape = null; state.nextId = 1;
    populateShapes(mountedContainer);
    populateEdgeTypes(mountedContainer);
    updateToolbarVisibility();
    render();
    updateSource();
  });

  edgeTypeSelect.addEventListener('change', () => {
    state.edgeType = edgeTypeSelect.value;
  });

  mountedContainer.querySelector('#me-btn-delete').addEventListener('click', deleteSelected);
  mountedContainer.querySelector('#me-btn-clear').addEventListener('click', () => {
    if (state.nodes.length && !confirm('Clear all nodes and edges?')) return;
    state.nodes = []; state.edges = []; state.selected.clear(); state.nextId = 1;
    render(); updateSource();
  });
  mountedContainer.querySelector('#me-btn-insert').addEventListener('click', insertIntoMarkdown);
  mountedContainer.querySelector('#me-btn-import').addEventListener('click', importFromText);
  mountedContainer.querySelector('#me-btn-svg').addEventListener('click', exportSVG);
  mountedContainer.querySelector('#me-btn-png').addEventListener('click', exportPNG);
  mountedContainer.querySelector('#me-btn-link').addEventListener('click', toggleLinkMode);

  // Source textarea → re-parse on blur
  mountedContainer.querySelector('#me-source').addEventListener('blur', e => {
    parseMermaid(e.target.value.trim());
  });

  // Canvas events
  svgEl.addEventListener('mousedown',  onCanvasMouseDown);
  svgEl.addEventListener('mousemove',  onCanvasMouseMove);
  svgEl.addEventListener('mouseup',    onCanvasMouseUp);
  svgEl.addEventListener('click',      onCanvasClick);
  svgEl.addEventListener('contextmenu', onContextMenu);
  svgEl.addEventListener('keydown',    onCanvasKey);

  // Drag ghost cursor when pending shape selected
  svgEl.addEventListener('mousemove', e => {
    const hint = mountedContainer.querySelector('#me-drop-hint');
    hint.hidden = state.nodes.length > 0 || state.pendingShape !== null;
  });
}

// ── Shape selection ────────────────────────────────────────────────────
function selectPendingShape(shapeId, btn) {
  state.pendingShape = shapeId;
  state.connecting   = null;
  mountedContainer.querySelectorAll('.me-shape-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.shape === shapeId));
  svgEl.style.cursor = 'crosshair';
  setStatus(`Click canvas to place: ${shapeId}`);
}

function clearPendingShape() {
  state.pendingShape = null;
  mountedContainer.querySelectorAll('.me-shape-btn').forEach(b => b.classList.remove('active'));
  svgEl.style.cursor = state.linkMode ? 'crosshair' : '';
}

function toggleLinkMode() {
  state.linkMode = !state.linkMode;
  state.connecting = null;
  canvasG.querySelector('#me-connect-line')?.remove();
  const btn = mountedContainer.querySelector('#me-btn-link');
  btn.classList.toggle('active', state.linkMode);
  svgEl.classList.toggle('me-link-mode', state.linkMode);
  svgEl.style.cursor = state.linkMode ? 'crosshair' : '';
  setStatus(state.linkMode ? 'Link mode: click a node to start a connection' : 'Ready');
}

// ── Canvas mouse handling ──────────────────────────────────────────────
function getSVGPoint(e) {
  const rect = svgEl.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function nodeAtPoint(pt) {
  return [...state.nodes].reverse().find(n =>
    pt.x >= n.x && pt.x <= n.x + n.w &&
    pt.y >= n.y && pt.y <= n.y + n.h);
}

function onCanvasClick(e) {
  const nodeEl = e.target.closest('.me-node');

  // Cancel connection on background click
  if (state.connecting && !nodeEl) {
    state.connecting = null;
    if (state.linkMode) {
      svgEl.style.cursor = 'crosshair'; // keep link mode active
      setStatus('Link mode — click a node to connect. Escape to exit.');
    } else {
      svgEl.style.cursor = '';
      setStatus('Connection cancelled');
    }
    return;
  }

  // Port click — start a connection (only if not already connecting)
  if (!state.connecting && e.target.classList.contains('me-port')) {
    const fromId = e.target.dataset.nodeId;
    if (fromId) {
      state.connecting = { fromId };
      svgEl.style.cursor = 'crosshair';
      setStatus('Release mouse over another node to connect — Escape to cancel');
    }
    return;
  }

  // Node click in link mode — start connection; don't let click event cancel it
  // (onCanvasMouseDown already set state.connecting for link mode)
  if (nodeEl && state.linkMode && state.connecting) {
    return; // let mouseup handle it
  }

  if (nodeEl) return;
  if (!state.pendingShape) {
    state.selected.clear();
    state.selectedEdges.clear();
    render();
    mountedContainer.querySelector('#me-props').innerHTML = '';
    return;
  }

  const pt    = getSVGPoint(e);
  const shape = DIAGRAM_TYPES[state.diagramType].shapes.find(s => s.id === state.pendingShape);
  if (!shape) return;

  const label = `${shape.label} ${state.nextId}`;
  const isCircular = state.pendingShape === 'circle' || state.pendingShape === 'dbl_circle' ||
                     state.pendingShape === 'ef_circle' || state.pendingShape === 'ef_dbl';
  let nw = 120, nh = isCircular ? 60 : 50;

  // Per-type sizing overrides
  if (state.pendingShape === 'actor') { nw = 100; nh = 70; }
  else if (['participant','boundary','control','entity','database','collections','queue'].includes(state.pendingShape)) { nw = 100; nh = 60; }
  else if (state.pendingShape === 'section') { nw = 200; nh = 36; }
  else if (state.pendingShape === 'task')    { nw = 200; nh = 50; }
  else if (state.pendingShape === 'c4_person' || state.pendingShape === 'c4_person_ext') { nw = 100; nh = 100; }
  else if (state.pendingShape === 'c4_boundary') { nw = 220; nh = 160; }
  else if (state.pendingShape && state.pendingShape.startsWith('c4_')) { nw = 160; nh = 90; }
  else if (['class','interface','abstract','enum'].includes(state.pendingShape)) { nw = 160; nh = 60; }
  else if (isCircular) { nw = 60; nh = 60; }

  const node = {
    id:    `N${state.nextId++}`,
    type:  state.pendingShape,
    label,
    x:     pt.x - nw / 2,
    y:     pt.y - nh / 2,
    w:     nw,
    h:     nh,
  };

  // Extra fields for specific types
  if (['class','interface','abstract','enum'].includes(state.pendingShape)) {
    node.members = [];
  }
  if (state.pendingShape === 'task') {
    node.score  = 3;
    node.actors = 'User';
  }
  if (state.pendingShape && state.pendingShape.startsWith('c4_')) {
    node.desc  = '';
    node.techn = '';
  }

  state.nodes.push(node);
  clearPendingShape();
  render();
  updateSource();
  selectNode(node.id, false);
  showProps(node.id);
}

let dragState = null;

function onCanvasMouseDown(e) {
  const nodeEl = e.target.closest('.me-node');

  // In link mode, any click on a node (including a port) starts a connection
  if (state.linkMode && nodeEl) {
    e.preventDefault();
    const nodeId = nodeEl.dataset.nodeId;
    state.connecting = { fromId: nodeId };
    svgEl.style.cursor = 'crosshair';
    setStatus('Link mode — release over another node to connect. Escape to cancel.');
    return;
  }

  // Port has its own mousedown handler in drawNodePorts
  if (e.target.classList.contains('me-port')) return;
  if (!nodeEl) return;

  const nodeId = nodeEl.dataset.nodeId;
  const node   = state.nodes.find(n => n.id === nodeId);
  if (!node) return;

  // If connecting via port, don't start a drag
  if (state.connecting) return;

  const pt = getSVGPoint(e);
  const toMove = state.selected.has(nodeId) ? [...state.selected] : [nodeId];
  const origPositions = {};
  toMove.forEach(id => {
    const n = state.nodes.find(x => x.id === id);
    if (n) origPositions[id] = { x: n.x, y: n.y };
  });

  dragState = { nodeId, startX: pt.x, startY: pt.y, origPositions, moved: false };
  e.preventDefault();
}

function onCanvasMouseMove(e) {
  // Draw the temporary connection line when connecting
  if (state.connecting) {
    const pt       = getSVGPoint(e);
    const fromNode = state.nodes.find(n => n.id === state.connecting.fromId);
    if (!fromNode) return;

    const fx = fromNode.x + fromNode.w / 2;
    const fy = fromNode.y + fromNode.h / 2;

    // Check if hovering a valid target node (ports are top-level SVG children)
    let nodeId = null;
    const nodeEl = e.target.closest('.me-node');
    if (nodeEl) nodeId = nodeEl.dataset.nodeId;
    else if (e.target.classList.contains('me-port')) nodeId = e.target.dataset.nodeId;
    const isValid = nodeId && nodeId !== state.connecting.fromId;
    const colour  = isValid ? '#00d4a0' : '#ff8c00'; // green = valid, orange = dragging

    let line = canvasG.querySelector('#me-connect-line');
    if (!line) {
      line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.id = 'me-connect-line';
      line.setAttribute('pointer-events', 'none');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-dasharray', '6 3');
      canvasG.appendChild(line);
    }
    const targetNode = isValid
      ? state.nodes.find(n => n.id === nodeId)
      : null;

    line.setAttribute('x1', fx);
    line.setAttribute('y1', fy);
    line.setAttribute('x2', targetNode ? targetNode.x + targetNode.w / 2 : pt.x);
    line.setAttribute('y2', targetNode ? targetNode.y + targetNode.h / 2 : pt.y);
    line.setAttribute('stroke', colour);
    return;
  }

  // Remove connect line if not connecting
  canvasG.querySelector('#me-connect-line')?.remove();

  if (!dragState) return;
  const pt = getSVGPoint(e);
  const dx = pt.x - dragState.startX;
  const dy = pt.y - dragState.startY;
  dragState.moved = true;

  Object.entries(dragState.origPositions).forEach(([id, orig]) => {
    const n = state.nodes.find(x => x.id === id);
    if (n) { n.x = orig.x + dx; n.y = orig.y + dy; }
  });
  render();
}

function onCanvasMouseUp(e) {
  // Complete a pending connection — fires on whatever node or port the mouse is released over
  if (state.connecting) {
    canvasG.querySelector('#me-connect-line')?.remove();
    // Ports are top-level SVG children, so also check for .me-port target
    const nodeEl = e.target.closest('.me-node') ||
                   (e.target.classList.contains('me-port') ?
                    canvasG.querySelector(`.me-node[data-node-id="${e.target.dataset.nodeId}"]`) : null);
    if (nodeEl) {
      const toId = nodeEl.dataset.nodeId;
      if (toId !== state.connecting.fromId) {
        const dt    = DIAGRAM_TYPES[state.diagramType];
        const etype = dt.edgeTypes.find(et => et.id === state.edgeType) || dt.edgeTypes[0];
        state.edges.push({
          id:       `E${state.nextId++}`,
          from:     state.connecting.fromId,
          to:       toId,
          label:    '',
          edgeType: state.edgeType,
          syntax:   etype.syntax,
        });
        updateSource();
        setStatus('Connected');
      } else {
        setStatus('Cannot connect a node to itself');
      }
    } else {
      setStatus(state.linkMode ? 'Link mode — click a node to connect. Escape to exit.' : 'Ready');
    }
    state.connecting = null;
    svgEl.style.cursor = state.linkMode ? 'crosshair' : '';
    render();
    return;
  }

  if (dragState) {
    if (!dragState.moved) {
      const multi = e.metaKey || e.ctrlKey;
      selectNode(dragState.nodeId, multi);
      showProps(dragState.nodeId);
    } else {
      updateSource();
    }
    dragState = null;
  }
}

function onCanvasKey(e) {
  if (e.key === 'Escape') {
    if (state.connecting) {
      canvasG.querySelector('#me-connect-line')?.remove();
      state.connecting = null;
      svgEl.style.cursor = state.linkMode ? 'crosshair' : '';
      setStatus(state.linkMode ? 'Link mode — click to connect. Escape again to exit.' : 'Ready');
      return;
    }
    if (state.linkMode) {
      toggleLinkMode();
      return;
    }
  }
  if (e.key === 'l' || e.key === 'L') {
    if (document.activeElement !== mountedContainer.querySelector('#me-source')) {
      toggleLinkMode(); return;
    }
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (document.activeElement !== mountedContainer.querySelector('#me-source')) {
      deleteSelected(); e.preventDefault();
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'c') copySelected();
  if ((e.ctrlKey || e.metaKey) && e.key === 'v') pasteClipboard();
}

// ── Selection ──────────────────────────────────────────────────────────
function selectNode(id, multi) {
  state.selectedEdges.clear();
  if (!multi) state.selected.clear();
  if (state.selected.has(id)) state.selected.delete(id);
  else state.selected.add(id);
  svgEl.focus();
  render();
}

function selectEdge(id, multi) {
  state.selected.clear();
  mountedContainer.querySelector('#me-props').innerHTML = '';
  if (!multi) state.selectedEdges.clear();
  if (state.selectedEdges.has(id)) state.selectedEdges.delete(id);
  else state.selectedEdges.add(id);
  svgEl.focus();
  render();
}

function editEdgeLabel(edgeId) {
  const edge = state.edges.find(e => e.id === edgeId);
  if (!edge) return;
  const newLabel = prompt('Edge label:', edge.label || '');
  if (newLabel === null) return;
  edge.label = newLabel;
  render(); updateSource();
}

function deleteSelected() {
  state.nodes = state.nodes.filter(n => !state.selected.has(n.id));
  state.edges = state.edges.filter(e =>
    !state.selected.has(e.from) && !state.selected.has(e.to) &&
    !state.selectedEdges.has(e.id));
  state.selected.clear();
  state.selectedEdges.clear();
  render(); updateSource();
  mountedContainer.querySelector('#me-props').innerHTML = '';
}

function copySelected() {
  state.clipboard = state.nodes
    .filter(n => state.selected.has(n.id))
    .map(n => ({ ...n }));
  setStatus(`Copied ${state.clipboard.length} node(s)`);
}

function pasteClipboard() {
  if (!state.clipboard?.length) return;
  state.selected.clear();
  state.clipboard.forEach(n => {
    const newNode = { ...n, id: `N${state.nextId++}`, x: n.x + 20, y: n.y + 20 };
    state.nodes.push(newNode);
    state.selected.add(newNode.id);
  });
  render(); updateSource();
}

// ── Context menu ───────────────────────────────────────────────────────
function onContextMenu(e) {
  e.preventDefault();
  removeContextMenu();
  const nodeEl = e.target.closest('.me-node');
  const menu   = document.createElement('div');
  menu.className = 'me-context-menu';
  menu.style.left = `${e.clientX}px`;
  menu.style.top  = `${e.clientY}px`;

  const items = nodeEl
    ? [
        { label: 'Copy',        action: copySelected },
        { label: 'Paste',       action: pasteClipboard },
        { label: '─', sep: true },
        { label: 'Delete',      action: deleteSelected },
        { label: 'Edit label',  action: () => editLabel(nodeEl.dataset.nodeId) },
      ]
    : [
        { label: 'Paste',       action: pasteClipboard },
        { label: 'Select all',  action: () => { state.nodes.forEach(n => state.selected.add(n.id)); render(); } },
      ];

  items.forEach(item => {
    if (item.sep) {
      const sep = document.createElement('div');
      sep.className = 'me-ctx-sep';
      menu.appendChild(sep);
      return;
    }
    const btn = document.createElement('button');
    btn.className   = 'me-ctx-item';
    btn.textContent = item.label;
    btn.addEventListener('click', () => { item.action(); removeContextMenu(); });
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);
  document.addEventListener('mousedown', removeContextMenu, { once: true });
}

function removeContextMenu() {
  document.querySelectorAll('.me-context-menu').forEach(m => m.remove());
}

// ── Label editing ──────────────────────────────────────────────────────
function editLabel(nodeId) {
  const node = state.nodes.find(n => n.id === nodeId);
  if (!node) return;
  const newLabel = prompt('Label:', node.label);
  if (newLabel === null) return;
  node.label = newLabel || node.label;
  render(); updateSource();
}

function showProps(nodeId) {
  const node  = state.nodes.find(n => n.id === nodeId);
  const propsEl = mountedContainer.querySelector('#me-props');

  if (!node) {
    // No selection — show diagram-level props for journey/c4
    if (state.diagramType === 'journey') {
      propsEl.innerHTML = `
        <div class="me-prop-row">
          <label class="me-prop-label">Title</label>
          <input class="me-prop-input" id="me-prop-journey-title" value="${state.journeyTitle}" />
        </div>`;
      propsEl.querySelector('#me-prop-journey-title').addEventListener('input', e => {
        state.journeyTitle = e.target.value; updateSource();
      });
    } else if (state.diagramType === 'c4') {
      propsEl.innerHTML = `
        <div class="me-prop-row">
          <label class="me-prop-label">Title</label>
          <input class="me-prop-input" id="me-prop-c4-title" value="${state.c4Title}" />
        </div>`;
      propsEl.querySelector('#me-prop-c4-title').addEventListener('input', e => {
        state.c4Title = e.target.value; updateSource();
      });
    } else {
      propsEl.innerHTML = '';
    }
    return;
  }

  const isClassNode = ['class','interface','abstract','enum'].includes(node.type);
  const isTaskNode  = node.type === 'task';
  const isC4Node    = node.type && node.type.startsWith('c4_');

  let extraHtml = '';
  if (isClassNode) {
    const membersVal = (node.members || []).join('\n').replace(/"/g, '&quot;');
    extraHtml = `
    <div class="me-prop-row" style="flex-direction:column;align-items:flex-start">
      <label class="me-prop-label">Members (one per line)</label>
      <textarea class="me-prop-input" id="me-prop-members" rows="5" style="width:100%;margin-top:4px;resize:vertical">${membersVal}</textarea>
    </div>`;
  } else if (isTaskNode) {
    extraHtml = `
    <div class="me-prop-row">
      <label class="me-prop-label">Score (1-5)</label>
      <input class="me-prop-input me-prop-input--short" id="me-prop-score" type="number" min="1" max="5" value="${node.score || 3}" />
    </div>
    <div class="me-prop-row">
      <label class="me-prop-label">Actors</label>
      <input class="me-prop-input" id="me-prop-actors" value="${node.actors || 'User'}" />
    </div>`;
  } else if (isC4Node) {
    extraHtml = `
    <div class="me-prop-row" style="flex-direction:column;align-items:flex-start">
      <label class="me-prop-label">Description</label>
      <textarea class="me-prop-input" id="me-prop-desc" rows="3" style="width:100%;margin-top:4px;resize:vertical">${(node.desc || '').replace(/"/g, '&quot;')}</textarea>
    </div>
    <div class="me-prop-row">
      <label class="me-prop-label">Technology</label>
      <input class="me-prop-input" id="me-prop-techn" value="${node.techn || ''}" />
    </div>`;
  }

  propsEl.innerHTML = `
    <div class="me-prop-row">
      <label class="me-prop-label">ID</label>
      <input class="me-prop-input" id="me-prop-id" value="${node.id}" />
    </div>
    <div class="me-prop-row">
      <label class="me-prop-label">Label</label>
      <input class="me-prop-input" id="me-prop-label" value="${node.label}" />
    </div>
    <div class="me-prop-row">
      <label class="me-prop-label">W</label>
      <input class="me-prop-input me-prop-input--short" id="me-prop-w" type="number" value="${node.w}" />
      <label class="me-prop-label">H</label>
      <input class="me-prop-input me-prop-input--short" id="me-prop-h" type="number" value="${node.h}" />
    </div>${extraHtml}`;

  propsEl.querySelector('#me-prop-label').addEventListener('input', e => {
    node.label = e.target.value; render(); updateSource();
  });
  propsEl.querySelector('#me-prop-w').addEventListener('input', e => {
    node.w = parseInt(e.target.value) || node.w; render();
  });
  propsEl.querySelector('#me-prop-h').addEventListener('input', e => {
    node.h = parseInt(e.target.value) || node.h; render();
  });

  if (isClassNode) {
    propsEl.querySelector('#me-prop-members').addEventListener('input', e => {
      node.members = e.target.value.split('\n').filter(l => l.trim());
      node.h = Math.max(60, 30 + 4 + node.members.length * 16 + 4);
      render(); updateSource();
    });
  }
  if (isTaskNode) {
    propsEl.querySelector('#me-prop-score').addEventListener('input', e => {
      node.score = Math.min(5, Math.max(1, parseInt(e.target.value) || 3));
      render(); updateSource();
    });
    propsEl.querySelector('#me-prop-actors').addEventListener('input', e => {
      node.actors = e.target.value; updateSource();
    });
  }
  if (isC4Node) {
    propsEl.querySelector('#me-prop-desc').addEventListener('input', e => {
      node.desc = e.target.value; updateSource();
    });
    propsEl.querySelector('#me-prop-techn').addEventListener('input', e => {
      node.techn = e.target.value; updateSource();
    });
  }
}

// ── SVG rendering ──────────────────────────────────────────────────────
function render() {
  // Remove existing nodes, edges, ports (keep defs and grid bg)
  canvasG.querySelectorAll('.me-node, .me-edge, .me-edge-hit, .me-edge-label, .me-er-label, .me-port').forEach(el => el.remove());

  // Draw edges first (behind nodes)
  state.edges.forEach(drawEdge);

  // Draw nodes
  state.nodes.forEach(drawNode);

  // Draw connection port handles — rendered as top-level SVG children so
  // mouseleave on the node group doesn't hide ports when cursor reaches them
  drawPorts();
}

function drawPorts() {
  // Ports are now drawn inside drawNode() as children of each node group.
  // This ensures the CSS selector .me-node:hover .me-port works correctly.
}

function drawNodePorts(node, nodeG) {
  const ports = [
    { cx: node.w / 2, cy: 0,             side: 'top' },
    { cx: node.w,     cy: node.h / 2,     side: 'right' },
    { cx: node.w / 2, cy: node.h,         side: 'bottom' },
    { cx: 0,          cy: node.h / 2,     side: 'left' },
  ];
  ports.forEach(pt => {
    const port = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    port.setAttribute('cx', pt.cx);
    port.setAttribute('cy', pt.cy);
    port.setAttribute('r', '5');
    port.setAttribute('class', 'me-port');
    port.dataset.nodeId = node.id;
    port.addEventListener('mouseenter', () => {
      port.setAttribute('opacity', '1');
      port.setAttribute('pointer-events', 'all');
    });
    port.addEventListener('mouseleave', () => {
      // Only hide if not in connecting mode for this port's node
      if (!state.connecting || state.connecting.fromId !== node.id) {
        port.setAttribute('opacity', '0');
        port.setAttribute('pointer-events', 'none');
      }
    });
    port.addEventListener('mousedown', e => {
      e.stopPropagation();
      state.connecting = { fromId: node.id };
      svgEl.style.cursor = 'crosshair';
      setStatus('Release over another node to connect — Escape to cancel');
      port.setAttribute('opacity', '1');
      port.setAttribute('pointer-events', 'all');
    });
    nodeG.appendChild(port);
  });
}

const CLASS_NODE_TYPES = new Set(['class','interface','abstract','enum']);

function drawNode(node) {
  // For class nodes, recompute height based on members
  if (CLASS_NODE_TYPES.has(node.type)) {
    node.h = Math.max(60, 30 + 4 + (node.members || []).length * 16 + 4);
  }

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', 'me-node' + (state.selected.has(node.id) ? ' selected' : ''));
  g.setAttribute('data-node-id', node.id);
  g.setAttribute('transform', `translate(${node.x},${node.y})`);

  const shape = shapeForNode(node);
  g.appendChild(shape);

  // Class nodes, section nodes have their own text; skip default label
  const skipDefaultLabel = CLASS_NODE_TYPES.has(node.type) || node.type === 'section';

  if (!skipDefaultLabel) {
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', node.w / 2);
    text.setAttribute('y', node.h / 2 + 5);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('class', 'me-node-label');

    // start/end: no label text (the filled circle IS the marker)
    if (node.type === 'start' || node.type === 'end') {
      text.textContent = '';
    } else if (node.type === 'choice') {
      text.textContent = '?';
    } else if (node.type === 'fork') {
      text.textContent = '[ fork ]';
    } else {
      text.textContent = node.label;
    }
    g.appendChild(text);
  }

  g.addEventListener('dblclick', () => editLabel(node.id));

  // Ports are now children of the node group — CSS handles visibility via .me-node:hover .me-port
  // JS handlers on ports manage visibility during active connections
  drawNodePorts(node, g);

  canvasG.appendChild(g);
}

function shapeForNode(node) {
  const { type, w, h } = node;
  const sel = state.selected.has(node.id);
  const cls = 'me-shape' + (sel ? ' selected' : '');

  if (type === 'diamond' || type === 'choice') {
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', `${w/2},0 ${w},${h/2} ${w/2},${h} 0,${h/2}`);
    poly.setAttribute('class', cls);
    return poly;
  }
  if (type === 'circle' || type === 'dbl_circle') {
    const r = Math.min(w, h) / 2;
    if (type === 'dbl_circle') {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const outer = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      outer.setAttribute('cx', w / 2); outer.setAttribute('cy', h / 2);
      outer.setAttribute('r', r);
      outer.setAttribute('class', cls);
      const inner = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      inner.setAttribute('cx', w / 2); inner.setAttribute('cy', h / 2);
      inner.setAttribute('r', r - 5);
      inner.setAttribute('class', cls);
      g.appendChild(outer);
      g.appendChild(inner);
      return g;
    }
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', w / 2); circle.setAttribute('cy', h / 2);
    circle.setAttribute('r', r);
    circle.setAttribute('class', cls);
    return circle;
  }
  if (type === 'ellipse') {
    const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    ellipse.setAttribute('cx', w / 2); ellipse.setAttribute('cy', h / 2);
    ellipse.setAttribute('rx', w / 2); ellipse.setAttribute('ry', h / 2);
    ellipse.setAttribute('class', cls);
    return ellipse;
  }
  if (type === 'hex') {
    const off = w * 0.15;
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points',
      `${off},0 ${w-off},0 ${w},${h/2} ${w-off},${h} ${off},${h} 0,${h/2}`);
    poly.setAttribute('class', cls);
    return poly;
  }
  if (type === 'para') {
    const off = w * 0.15;
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', `${off},0 ${w},0 ${w-off},${h} 0,${h}`);
    poly.setAttribute('class', cls);
    return poly;
  }
  if (type === 'para_alt') {
    const off = w * 0.15;
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', `0,0 ${w-off},0 ${w},${h} ${off},${h}`);
    poly.setAttribute('class', cls);
    return poly;
  }
  if (type === 'asymmetric') {
    const tip = w * 0.85;
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', `0,0 ${tip},0 ${w},${h/2} ${tip},${h} 0,${h}`);
    poly.setAttribute('class', cls);
    return poly;
  }
  if (type === 'trapezoid') {
    const off = w * 0.15;
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', `${off},0 ${w-off},0 ${w},${h} 0,${h}`);
    poly.setAttribute('class', cls);
    return poly;
  }
  if (type === 'trap_alt') {
    const off = w * 0.15;
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', `0,0 ${w},0 ${w-off},${h} ${off},${h}`);
    poly.setAttribute('class', cls);
    return poly;
  }
  if (type === 'db') {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const rx = w / 2, ry = Math.max(8, h * 0.18);
    const body = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    body.setAttribute('d',
      `M 0,${ry} A ${rx},${ry} 0 0,0 ${w},${ry} L ${w},${h-ry} A ${rx},${ry} 0 0,1 0,${h-ry} Z`);
    body.setAttribute('class', cls);
    const topEllipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    topEllipse.setAttribute('cx', w / 2); topEllipse.setAttribute('cy', ry);
    topEllipse.setAttribute('rx', rx); topEllipse.setAttribute('ry', ry);
    topEllipse.setAttribute('class', cls);
    g.appendChild(body);
    g.appendChild(topEllipse);
    return g;
  }
  if (type === 'subroutine') {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('width', w); rect.setAttribute('height', h);
    rect.setAttribute('rx', 2); rect.setAttribute('ry', 2);
    rect.setAttribute('class', cls);
    const inset = 8;
    const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line1.setAttribute('x1', inset); line1.setAttribute('y1', 0);
    line1.setAttribute('x2', inset); line1.setAttribute('y2', h);
    line1.setAttribute('class', 'me-shape-line');
    const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line2.setAttribute('x1', w - inset); line2.setAttribute('y1', 0);
    line2.setAttribute('x2', w - inset); line2.setAttribute('y2', h);
    line2.setAttribute('class', 'me-shape-line');
    g.appendChild(rect);
    g.appendChild(line1);
    g.appendChild(line2);
    return g;
  }
  if (type === 'start' || type === 'end') {
    const r = Math.min(w, h) / 2;
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', w / 2); circle.setAttribute('cy', h / 2);
    circle.setAttribute('r', r);
    circle.setAttribute('class', 'me-shape me-shape--terminal' + (sel ? ' selected' : ''));
    return circle;
  }

  // ── Expanded flowchart shapes ──────────────────────────────────────────
  if (type === 'ef_proc') {
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('width', w); r.setAttribute('height', h);
    r.setAttribute('rx', 2); r.setAttribute('ry', 2);
    r.setAttribute('class', cls); return r;
  }
  if (type === 'ef_decision') {
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', `${w/2},0 ${w},${h/2} ${w/2},${h} 0,${h/2}`);
    poly.setAttribute('class', cls); return poly;
  }
  if (type === 'ef_db') {
    const g2 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const rx2 = w / 2, ry2 = Math.max(8, h * 0.18);
    const body2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    body2.setAttribute('d', `M 0,${ry2} A ${rx2},${ry2} 0 0,0 ${w},${ry2} L ${w},${h-ry2} A ${rx2},${ry2} 0 0,1 0,${h-ry2} Z`);
    body2.setAttribute('class', cls);
    const topEl2 = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    topEl2.setAttribute('cx', w / 2); topEl2.setAttribute('cy', ry2);
    topEl2.setAttribute('rx', rx2); topEl2.setAttribute('ry', ry2);
    topEl2.setAttribute('class', cls);
    g2.appendChild(body2); g2.appendChild(topEl2); return g2;
  }
  if (type === 'ef_event') {
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('width', w); r.setAttribute('height', h);
    r.setAttribute('rx', 10); r.setAttribute('ry', 10);
    r.setAttribute('class', cls); return r;
  }
  if (type === 'ef_terminal') {
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('width', w); r.setAttribute('height', h);
    r.setAttribute('rx', h / 2); r.setAttribute('ry', h / 2);
    r.setAttribute('class', cls); return r;
  }
  if (type === 'ef_doc' || type === 'ef_doc2') {
    const g2 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const wave = h * 0.15;
    const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path2.setAttribute('d', `M 0,0 L ${w},0 L ${w},${h-wave} Q ${w*0.75},${h} ${w*0.5},${h-wave} Q ${w*0.25},${h-wave*2} 0,${h-wave} Z`);
    path2.setAttribute('class', cls);
    g2.appendChild(path2); return g2;
  }
  if (type === 'ef_circle') {
    const r2 = Math.min(w, h) / 2;
    const circ = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circ.setAttribute('cx', w / 2); circ.setAttribute('cy', h / 2);
    circ.setAttribute('r', r2); circ.setAttribute('class', cls); return circ;
  }
  if (type === 'ef_dbl') {
    const r2 = Math.min(w, h) / 2;
    const g2 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const outer2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    outer2.setAttribute('cx', w / 2); outer2.setAttribute('cy', h / 2);
    outer2.setAttribute('r', r2); outer2.setAttribute('class', cls);
    const inner2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    inner2.setAttribute('cx', w / 2); inner2.setAttribute('cy', h / 2);
    inner2.setAttribute('r', r2 - 5); inner2.setAttribute('class', cls);
    g2.appendChild(outer2); g2.appendChild(inner2); return g2;
  }
  if (type === 'ef_hex' || type === 'ef_bolt') {
    const off2 = w * 0.15;
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', `${off2},0 ${w-off2},0 ${w},${h/2} ${w-off2},${h} ${off2},${h} 0,${h/2}`);
    poly.setAttribute('class', cls); return poly;
  }
  if (type === 'ef_tri') {
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', `${w/2},0 ${w},${h} 0,${h}`);
    poly.setAttribute('class', cls); return poly;
  }
  if (type === 'ef_hourglass') {
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', `0,0 ${w},0 0,${h} ${w},${h}`);
    poly.setAttribute('class', cls); return poly;
  }
  if (type === 'ef_lean_r') {
    const off2 = w * 0.15;
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', `${off2},0 ${w},0 ${w-off2},${h} 0,${h}`);
    poly.setAttribute('class', cls); return poly;
  }
  if (type === 'ef_lean_l') {
    const off2 = w * 0.15;
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', `0,0 ${w-off2},0 ${w},${h} ${off2},${h}`);
    poly.setAttribute('class', cls); return poly;
  }
  if (type === 'ef_trap_t') {
    const off2 = w * 0.15;
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', `${off2},0 ${w-off2},0 ${w},${h} 0,${h}`);
    poly.setAttribute('class', cls); return poly;
  }
  if (type === 'ef_trap_b') {
    const off2 = w * 0.15;
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', `0,0 ${w},0 ${w-off2},${h} ${off2},${h}`);
    poly.setAttribute('class', cls); return poly;
  }
  if (type === 'ef_manual') {
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', `0,${h*0.2} ${w},0 ${w},${h} 0,${h}`);
    poly.setAttribute('class', cls); return poly;
  }
  if (type === 'ef_notch') {
    const off2 = w * 0.1;
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', `${off2},0 ${w-off2},0 ${w},${h/2} ${w-off2},${h} ${off2},${h} 0,${h/2}`);
    poly.setAttribute('class', cls); return poly;
  }
  if (type === 'ef_bow_tie') {
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', `0,${h/2} ${w/2},0 ${w},${h/2} ${w/2},${h}`);
    poly.setAttribute('class', cls); return poly;
  }
  if (type === 'ef_odd') {
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', `${w*0.1},0 ${w*0.9},0 ${w},${h/2} ${w*0.9},${h} ${w*0.1},${h} 0,${h/2}`);
    poly.setAttribute('class', cls); return poly;
  }

  // ── Class diagram shapes ───────────────────────────────────────────────
  if (type === 'class' || type === 'interface' || type === 'abstract' || type === 'enum') {
    const g2 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const headerH = 30;
    // Outer rect
    const outerRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    outerRect.setAttribute('width', w); outerRect.setAttribute('height', h);
    outerRect.setAttribute('rx', 2); outerRect.setAttribute('class', cls);
    g2.appendChild(outerRect);
    // Header fill
    const headerRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    headerRect.setAttribute('width', w); headerRect.setAttribute('height', headerH);
    headerRect.setAttribute('rx', 2); headerRect.setAttribute('class', 'me-class-header');
    g2.appendChild(headerRect);
    // Divider line
    const divider = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    divider.setAttribute('x1', 0); divider.setAttribute('y1', headerH);
    divider.setAttribute('x2', w); divider.setAttribute('y2', headerH);
    divider.setAttribute('class', 'me-class-divider');
    g2.appendChild(divider);
    // Stereotype text for non-class types
    let textY = headerH / 2 + 5;
    if (type !== 'class') {
      const stereoText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      stereoText.setAttribute('x', w / 2); stereoText.setAttribute('y', 8);
      stereoText.setAttribute('text-anchor', 'middle');
      stereoText.setAttribute('class', 'me-class-stereotype');
      stereoText.textContent = `<<${type}>>`;
      g2.appendChild(stereoText);
      textY = headerH - 6;
    }
    // Class name
    const nameText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    nameText.setAttribute('x', w / 2); nameText.setAttribute('y', textY);
    nameText.setAttribute('text-anchor', 'middle');
    nameText.setAttribute('class', 'me-node-label');
    nameText.setAttribute('pointer-events', 'none');
    nameText.textContent = node.label;
    g2.appendChild(nameText);
    // Member lines
    const members = node.members || [];
    members.forEach((member, i) => {
      const memberText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      memberText.setAttribute('x', 6);
      memberText.setAttribute('y', headerH + 4 + (i + 1) * 16);
      memberText.setAttribute('text-anchor', 'start');
      memberText.setAttribute('class', 'me-class-member');
      memberText.textContent = member;
      g2.appendChild(memberText);
    });
    return g2;
  }

  // ── Sequence participant shapes ────────────────────────────────────────
  if (type === 'participant') {
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('width', w); r.setAttribute('height', h);
    r.setAttribute('rx', 2); r.setAttribute('ry', 2);
    r.setAttribute('class', cls); return r;
  }
  if (type === 'actor') {
    const g2 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', w); bg.setAttribute('height', h);
    bg.setAttribute('rx', 2); bg.setAttribute('class', cls);
    g2.appendChild(bg);
    const head = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    head.setAttribute('cx', w / 2); head.setAttribute('cy', 10);
    head.setAttribute('r', 8); head.setAttribute('class', 'me-shape-line');
    head.setAttribute('fill', 'none');
    g2.appendChild(head);
    const body = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    body.setAttribute('x', w * 0.35); body.setAttribute('y', 22);
    body.setAttribute('width', w * 0.3); body.setAttribute('height', h - 32);
    body.setAttribute('class', 'me-shape-line'); body.setAttribute('fill', 'none');
    g2.appendChild(body);
    return g2;
  }
  if (type === 'boundary') {
    const g2 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('width', w); r.setAttribute('height', h);
    r.setAttribute('rx', 2); r.setAttribute('class', cls);
    g2.appendChild(r);
    const vline = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    vline.setAttribute('x1', 2); vline.setAttribute('y1', 0);
    vline.setAttribute('x2', 2); vline.setAttribute('y2', h);
    vline.setAttribute('class', 'me-shape-line');
    g2.appendChild(vline); return g2;
  }
  if (type === 'control') {
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('width', w); r.setAttribute('height', h);
    r.setAttribute('rx', h / 2); r.setAttribute('ry', h / 2);
    r.setAttribute('class', cls); return r;
  }
  if (type === 'entity') {
    const g2 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('width', w); r.setAttribute('height', h);
    r.setAttribute('rx', 2); r.setAttribute('class', cls);
    g2.appendChild(r);
    const underline = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    underline.setAttribute('x1', 0); underline.setAttribute('y1', 16);
    underline.setAttribute('x2', w); underline.setAttribute('y2', 16);
    underline.setAttribute('class', 'me-shape-line');
    g2.appendChild(underline); return g2;
  }
  if (type === 'database') {
    const g2 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const rx2 = w / 2, ry2 = Math.max(8, h * 0.18);
    const body2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    body2.setAttribute('d', `M 0,${ry2} A ${rx2},${ry2} 0 0,0 ${w},${ry2} L ${w},${h-ry2} A ${rx2},${ry2} 0 0,1 0,${h-ry2} Z`);
    body2.setAttribute('class', cls);
    const topEl2 = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    topEl2.setAttribute('cx', w / 2); topEl2.setAttribute('cy', ry2);
    topEl2.setAttribute('rx', rx2); topEl2.setAttribute('ry', ry2);
    topEl2.setAttribute('class', cls);
    g2.appendChild(body2); g2.appendChild(topEl2); return g2;
  }
  if (type === 'collections') {
    const g2 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const shadow = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    shadow.setAttribute('x', 4); shadow.setAttribute('y', 4);
    shadow.setAttribute('width', w - 4); shadow.setAttribute('height', h - 4);
    shadow.setAttribute('rx', 2); shadow.setAttribute('class', cls);
    shadow.setAttribute('opacity', '0.5');
    g2.appendChild(shadow);
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('width', w - 4); r.setAttribute('height', h - 4);
    r.setAttribute('rx', 2); r.setAttribute('class', cls);
    g2.appendChild(r); return g2;
  }
  if (type === 'queue') {
    const g2 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('width', w); r.setAttribute('height', h);
    r.setAttribute('rx', 2); r.setAttribute('class', cls);
    g2.appendChild(r);
    const inset = 8;
    const vl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    vl.setAttribute('x1', inset); vl.setAttribute('y1', 0);
    vl.setAttribute('x2', inset); vl.setAttribute('y2', h);
    vl.setAttribute('class', 'me-shape-line'); g2.appendChild(vl);
    const vr = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    vr.setAttribute('x1', w - inset); vr.setAttribute('y1', 0);
    vr.setAttribute('x2', w - inset); vr.setAttribute('y2', h);
    vr.setAttribute('class', 'me-shape-line'); g2.appendChild(vr);
    return g2;
  }

  // ── Journey shapes ─────────────────────────────────────────────────────
  if (type === 'section') {
    const g2 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('width', w); r.setAttribute('height', h);
    r.setAttribute('rx', 2); r.setAttribute('class', 'me-shape me-shape--section' + (sel ? ' selected' : ''));
    g2.appendChild(r);
    const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    txt.setAttribute('x', w / 2); txt.setAttribute('y', h / 2 + 5);
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('class', 'me-node-label');
    txt.setAttribute('pointer-events', 'none');
    txt.textContent = node.label;
    g2.appendChild(txt); return g2;
  }
  if (type === 'task') {
    const g2 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('width', w); r.setAttribute('height', h);
    r.setAttribute('rx', 2); r.setAttribute('class', cls);
    g2.appendChild(r);
    // Score bars at bottom
    const score = node.score || 3;
    const barW = 7, barH = 6, barGap = 3;
    const totalBarW = 5 * barW + 4 * barGap;
    const barStartX = (w - totalBarW) / 2;
    const barY = h - barH - 4;
    for (let i = 0; i < 5; i++) {
      const bar = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bar.setAttribute('x', barStartX + i * (barW + barGap));
      bar.setAttribute('y', barY);
      bar.setAttribute('width', barW); bar.setAttribute('height', barH);
      bar.setAttribute('rx', 1);
      bar.setAttribute('class', i < score ? 'me-task-score-bar' : 'me-task-score-empty');
      g2.appendChild(bar);
    }
    return g2;
  }

  // ── C4 shapes ──────────────────────────────────────────────────────────
  if (type === 'c4_person' || type === 'c4_person_ext') {
    const g2 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', w); bg.setAttribute('height', h);
    bg.setAttribute('rx', 6);
    bg.setAttribute('class', 'me-shape me-shape--c4-person' + (type === 'c4_person_ext' ? ' me-shape--c4-ext' : '') + (sel ? ' selected' : ''));
    g2.appendChild(bg);
    // Head
    const head = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    head.setAttribute('cx', w / 2); head.setAttribute('cy', 18);
    head.setAttribute('r', 10); head.setAttribute('fill', 'var(--bg1)');
    head.setAttribute('stroke', 'var(--border)');
    g2.appendChild(head);
    // Body line
    const bodyLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    bodyLine.setAttribute('x1', w / 2); bodyLine.setAttribute('y1', 28);
    bodyLine.setAttribute('x2', w / 2); bodyLine.setAttribute('y2', h - 24);
    bodyLine.setAttribute('stroke', 'var(--border)'); bodyLine.setAttribute('stroke-width', '2');
    g2.appendChild(bodyLine);
    // Arms
    const arms = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    arms.setAttribute('x1', w * 0.2); arms.setAttribute('y1', h * 0.45);
    arms.setAttribute('x2', w * 0.8); arms.setAttribute('y2', h * 0.45);
    arms.setAttribute('stroke', 'var(--border)'); arms.setAttribute('stroke-width', '2');
    g2.appendChild(arms);
    return g2;
  }
  if (type === 'c4_system' || type === 'c4_system_ext') {
    const g2 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('width', w); r.setAttribute('height', h);
    r.setAttribute('rx', 4);
    r.setAttribute('class', 'me-shape me-shape--c4-system' + (type === 'c4_system_ext' ? ' me-shape--c4-ext' : '') + (sel ? ' selected' : ''));
    g2.appendChild(r); return g2;
  }
  if (type === 'c4_systemdb') {
    const g2 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const rx2 = w / 2, ry2 = Math.max(8, h * 0.18);
    const body2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    body2.setAttribute('d', `M 0,${ry2} A ${rx2},${ry2} 0 0,0 ${w},${ry2} L ${w},${h-ry2} A ${rx2},${ry2} 0 0,1 0,${h-ry2} Z`);
    body2.setAttribute('class', cls);
    const topEl2 = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    topEl2.setAttribute('cx', w / 2); topEl2.setAttribute('cy', ry2);
    topEl2.setAttribute('rx', rx2); topEl2.setAttribute('ry', ry2);
    topEl2.setAttribute('class', cls);
    g2.appendChild(body2); g2.appendChild(topEl2); return g2;
  }
  if (type === 'c4_systemqueue') {
    const g2 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('x', h * 0.15); r.setAttribute('width', w - h * 0.3);
    r.setAttribute('height', h); r.setAttribute('rx', 2); r.setAttribute('class', cls);
    g2.appendChild(r);
    const leftCap = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    leftCap.setAttribute('cx', h * 0.15); leftCap.setAttribute('cy', h / 2);
    leftCap.setAttribute('rx', h * 0.15); leftCap.setAttribute('ry', h / 2);
    leftCap.setAttribute('class', cls); g2.appendChild(leftCap);
    const rightCap = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    rightCap.setAttribute('cx', w - h * 0.15); rightCap.setAttribute('cy', h / 2);
    rightCap.setAttribute('rx', h * 0.15); rightCap.setAttribute('ry', h / 2);
    rightCap.setAttribute('class', cls); g2.appendChild(rightCap);
    return g2;
  }
  if (type === 'c4_boundary') {
    const g2 = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('width', w); r.setAttribute('height', h);
    r.setAttribute('rx', 4);
    r.setAttribute('class', 'me-shape me-shape--boundary' + (sel ? ' selected' : ''));
    r.setAttribute('stroke-dasharray', '8 4');
    g2.appendChild(r); return g2;
  }

  // Default: rect
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('width', w); rect.setAttribute('height', h);
  const rx = type === 'round' ? 10 : type === 'stadium' ? h / 2 : 2;
  rect.setAttribute('rx', rx); rect.setAttribute('ry', rx);
  rect.setAttribute('class', cls);
  return rect;
}

function drawEdge(edge) {
  const from = state.nodes.find(n => n.id === edge.from);
  const to   = state.nodes.find(n => n.id === edge.to);
  if (!from || !to) return;

  const fx = from.x + from.w / 2, fy = from.y + from.h / 2;
  const tx = to.x   + to.w   / 2, ty = to.y   + to.h   / 2;

  // Exit/entry points on node border
  const { x: x1, y: y1 } = borderPoint(from, tx, ty);
  const { x: x2, y: y2 } = borderPoint(to, fx, fy);

  const isEr = state.diagramType === 'er';
  const isSelected = state.selectedEdges.has(edge.id);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

  if (isEr) {
    // ER edges: straight line with cardinality notation at each end
    path.setAttribute('d', `M${x1},${y1} L${x2},${y2}`);
    path.setAttribute('class', 'me-edge me-edge--er' + (isSelected ? ' selected' : ''));
  } else {
    // Flowchart/sequence/state: curved line with arrow
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - 20;
    path.setAttribute('d', `M${x1},${y1} Q${mx},${my} ${x2},${y2}`);
    path.setAttribute('class', 'me-edge' +
      (edge.edgeType === 'dotted' ? ' dotted' : edge.edgeType === 'thick' ? ' thick' : '') +
      (isSelected ? ' selected' : ''));
    path.setAttribute('marker-end', isSelected ? 'url(#me-arrow-sel)' : 'url(#me-arrow)');
  }

  const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  hitPath.setAttribute('d', path.getAttribute('d'));
  hitPath.setAttribute('class', 'me-edge-hit');
  hitPath.dataset.edgeId = edge.id;
  hitPath.addEventListener('click', e => {
    e.stopPropagation();
    selectEdge(edge.id, e.ctrlKey || e.metaKey);
  });
  hitPath.addEventListener('dblclick', e => {
    e.stopPropagation();
    editEdgeLabel(edge.id);
  });

  const firstNode = canvasG.querySelector('.me-node');
  canvasG.insertBefore(path, firstNode);
  canvasG.insertBefore(hitPath, firstNode);

  // ER cardinality labels at each endpoint
  if (isEr && edge.syntax) {
    const parts = edge.syntax.split('--');
    const fromCard = parts[0] || '';
    const toCard   = parts[1] || '';

    // Compute offset direction perpendicular to the edge line
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    // Offset the cardinality text slightly inward from border points
    const off = 8;
    const nx = -dy / len * off, ny = dx / len * off;

    if (fromCard) {
      const t1 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t1.setAttribute('x', x1 + nx);
      t1.setAttribute('y', y1 + ny + 4);
      t1.setAttribute('text-anchor', 'middle');
      t1.setAttribute('class', 'me-er-label');
      t1.textContent = fromCard;
      canvasG.appendChild(t1);
    }
    if (toCard) {
      const t2 = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t2.setAttribute('x', x2 - nx);
      t2.setAttribute('y', y2 - ny + 4);
      t2.setAttribute('text-anchor', 'middle');
      t2.setAttribute('class', 'me-er-label');
      t2.textContent = toCard;
      canvasG.appendChild(t2);
    }
  }

  if (edge.label) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - 12;
    const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    txt.setAttribute('x', mx); txt.setAttribute('y', my);
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('class', 'me-edge-label');
    txt.textContent = edge.label;
    canvasG.insertBefore(txt, canvasG.querySelector('.me-node'));
  }
}

function borderPoint(node, tx, ty) {
  const cx = node.x + node.w / 2, cy = node.y + node.h / 2;
  const dx = tx - cx, dy = ty - cy;
  const hw = node.w / 2, hh = node.h / 2;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const sx = dx === 0 ? 0 : Math.sign(dx);
  const sy = dy === 0 ? 0 : Math.sign(dy);
  const tx1 = dx === 0 ? Infinity : hw / Math.abs(dx);
  const ty1 = dy === 0 ? Infinity : hh / Math.abs(dy);
  const t   = Math.min(tx1, ty1);
  return { x: cx + dx * t, y: cy + dy * t };
}

// ── Mermaid source generation ──────────────────────────────────────────
function toMermaid() {
  const dt     = DIAGRAM_TYPES[state.diagramType];
  const lines  = [dt.header];

  if (state.diagramType === 'flowchart') {
    state.nodes.forEach(node => {
      const shape = dt.shapes.find(s => s.id === node.type);
      if (shape) lines.push('  ' + shape.mermaid(node.id, node.label));
    });
    state.edges.forEach(edge => {
      const et = dt.edgeTypes.find(e => e.id === edge.edgeType) || dt.edgeTypes[0];
      const lbl = edge.label ? `|${edge.label}|` : '';
      lines.push(`  ${edge.from} ${et.syntax}${lbl} ${edge.to}`);
    });
  } else if (state.diagramType === 'sequence') {
    state.nodes.forEach(node => {
      const shape = dt.shapes.find(s => s.id === node.type);
      if (shape) lines.push('  ' + shape.mermaid(node.id, node.label));
    });
    state.edges.forEach(edge => {
      const et = dt.edgeTypes.find(e => e.id === edge.edgeType) || dt.edgeTypes[0];
      const lbl = edge.label || 'message';
      lines.push(`  ${edge.from} ${et.syntax} ${edge.to}: ${lbl}`);
    });
  } else if (state.diagramType === 'state') {
    state.nodes.forEach(node => {
      if (node.type !== 'start' && node.type !== 'end') {
        lines.push(`  ${node.id}: ${node.label}`);
      }
    });
    state.edges.forEach(edge => {
      const lbl = edge.label ? `: ${edge.label}` : '';
      lines.push(`  ${edge.from} --> ${edge.to}${lbl}`);
    });
  } else if (state.diagramType === 'er') {
    const done = new Set();
    state.nodes.forEach(node => {
      if (!done.has(node.id)) {
        lines.push(`  ${node.label} {`);
        lines.push(`    string id`);
        lines.push(`  }`);
        done.add(node.id);
      }
    });
    state.edges.forEach(edge => {
      const fromNode = state.nodes.find(n => n.id === edge.from);
      const toNode   = state.nodes.find(n => n.id === edge.to);
      if (!fromNode || !toNode) return;
      const et  = dt.edgeTypes.find(e => e.id === edge.edgeType) || dt.edgeTypes[0];
      const lbl = edge.label || 'has';
      lines.push(`  ${fromNode.label} ${et.syntax} ${toNode.label} : ${lbl}`);
    });
  } else if (state.diagramType === 'expanded_flowchart') {
    state.nodes.forEach(node => {
      const shape = dt.shapes.find(s => s.id === node.type);
      if (shape) lines.push('  ' + shape.mermaid(node.id, node.label));
    });
    state.edges.forEach(edge => {
      const et = dt.edgeTypes.find(e => e.id === edge.edgeType) || dt.edgeTypes[0];
      const lbl = edge.label ? `|${edge.label}|` : '';
      lines.push(`  ${edge.from} ${et.syntax}${lbl} ${edge.to}`);
    });
  } else if (state.diagramType === 'class_diagram') {
    // Emit class declarations
    state.nodes.forEach(node => {
      const members = node.members || [];
      if (members.length > 0) {
        lines.push(`  class ${node.label} {`);
        if (node.type !== 'class') lines.push(`    <<${node.type}>>`);
        members.forEach(m => lines.push(`    ${m}`));
        lines.push(`  }`);
      } else {
        const shape = dt.shapes.find(s => s.id === node.type);
        if (shape) lines.push('  ' + shape.mermaid(node.id, node.label));
      }
    });
    // Emit relationships
    state.edges.forEach(edge => {
      const fromNode = state.nodes.find(n => n.id === edge.from);
      const toNode   = state.nodes.find(n => n.id === edge.to);
      if (!fromNode || !toNode) return;
      const et = dt.edgeTypes.find(e => e.id === edge.edgeType) || dt.edgeTypes[0];
      const lbl = edge.label ? ` : ${edge.label}` : '';
      lines.push(`  ${fromNode.label} ${et.syntax} ${toNode.label}${lbl}`);
    });
  } else if (state.diagramType === 'journey') {
    lines.push(`  title ${state.journeyTitle}`);
    // Sort nodes by y position
    const sorted = [...state.nodes].sort((a, b) => a.y - b.y);
    sorted.forEach(node => {
      if (node.type === 'section') {
        lines.push(`  section ${node.label}`);
      } else if (node.type === 'task') {
        lines.push(`    ${node.label}: ${node.score || 3}: ${node.actors || 'User'}`);
      }
    });
  } else if (state.diagramType === 'c4') {
    lines.push(`  title ${state.c4Title}`);
    // Boundaries wrap nodes inside them
    const boundaryNodes = state.nodes.filter(n => n.type === 'c4_boundary');
    const insideBoundary = new Set();
    boundaryNodes.forEach(b => {
      state.nodes.forEach(n => {
        if (n.id !== b.id && n.x >= b.x && n.y >= b.y &&
            n.x + n.w <= b.x + b.w && n.y + n.h <= b.y + b.h) {
          insideBoundary.add(n.id);
        }
      });
    });
    // Non-boundary, non-inside nodes first
    state.nodes.forEach(node => {
      if (node.type === 'c4_boundary' || insideBoundary.has(node.id)) return;
      const shape = dt.shapes.find(s => s.id === node.type);
      if (!shape) return;
      const desc = node.desc || '';
      const mermaidFn = (id, lbl) => {
        const base = shape.mermaid(id, lbl);
        // Replace empty desc string with actual desc
        return base.replace('"")', `"${desc}")`);
      };
      lines.push('  ' + mermaidFn(node.id, node.label));
    });
    // Boundary groups
    boundaryNodes.forEach(b => {
      lines.push(`  Boundary(${b.id}, "${b.label}") {`);
      state.nodes.forEach(node => {
        if (!insideBoundary.has(node.id) || node.type === 'c4_boundary') return;
        const shape2 = dt.shapes.find(s => s.id === node.type);
        if (!shape2) return;
        const desc2 = node.desc || '';
        const base2 = shape2.mermaid(node.id, node.label).replace('"")', `"${desc2}")`);
        lines.push('    ' + base2);
      });
      lines.push('  }');
    });
    // Edges
    state.edges.forEach(edge => {
      const et = dt.edgeTypes.find(e => e.id === edge.edgeType) || dt.edgeTypes[0];
      const lbl = edge.label || '';
      lines.push(`  ${et.syntax}(${edge.from}, ${edge.to}, "${lbl}")`);
    });
  }

  return lines.join('\n');
}

function updateSource() {
  const src = toMermaid();
  const srcEl = mountedContainer?.querySelector('#me-source');
  if (srcEl) srcEl.value = src;
}

// ── Mermaid parser (basic — for import/reload) ─────────────────────────
function parseMermaid(src) {
  state.nodes  = []; state.edges = []; state.selected.clear(); state.nextId = 1;
  const lines  = src.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) { render(); return; }

  const firstLine = lines[0];
  const header = firstLine.toLowerCase();
  let hasAtSyntax = lines.some(l => l.includes('@{'));
  if ((header.startsWith('flowchart') || header.startsWith('graph')) && hasAtSyntax) {
    state.diagramType = 'expanded_flowchart';
  } else if (header.startsWith('flowchart') || header.startsWith('graph')) {
    state.diagramType = 'flowchart';
  } else if (header.startsWith('sequencediagram')) {
    state.diagramType = 'sequence';
  } else if (header.startsWith('statediagram')) {
    state.diagramType = 'state';
  } else if (header.startsWith('erdiagram')) {
    state.diagramType = 'er';
  } else if (header.startsWith('classdiagram')) {
    state.diagramType = 'class_diagram';
  } else if (header.startsWith('journey')) {
    state.diagramType = 'journey';
  } else if (header.startsWith('c4context') || header.startsWith('c4container') || header.startsWith('c4component')) {
    state.diagramType = 'c4';
  }

  if (mountedContainer) {
    diagramTypeSelect.value = state.diagramType;
    populateShapes(mountedContainer);
    populateEdgeTypes(mountedContainer);
    updateToolbarVisibility();
  }

  let x = 80, y = 80, col = 0;
  const nodeMap = {};

  lines.slice(1).forEach(line => {
    // ── ER ────────────────────────────────────────────────────────────────
    if (state.diagramType === 'er') {
      const entityMatch = line.match(/^(\w+)\s+\{$/);
      if (entityMatch) {
        const id = entityMatch[1];
        if (!nodeMap[id]) {
          nodeMap[id] = { id, type: 'entity', label: id, x, y, w: 140, h: 60 };
          state.nodes.push(nodeMap[id]);
          x += 180; col++;
          if (col % 3 === 0) { x = 80; y += 90; }
        }
        return;
      }
      const erEdgeMatch = line.match(/^(\w+)\s+(.+?)\s*--\s*(.+?)\s+(\w+)\s*:\s*(.+)?$/);
      if (erEdgeMatch) {
        const [, from, leftCard, rightCard, to, label] = erEdgeMatch;
        const syntax = leftCard + '--' + rightCard;
        [from, to].forEach(id => {
          if (!nodeMap[id]) {
            nodeMap[id] = { id, type: 'entity', label: id, x, y, w: 140, h: 60 };
            state.nodes.push(nodeMap[id]);
            x += 180; col++;
            if (col % 3 === 0) { x = 80; y += 90; }
          }
        });
        const edgeTypeId = Object.values(DIAGRAM_TYPES.er.edgeTypes).find(e => e.syntax === syntax)?.id || 'one_one';
        state.edges.push({ id: `E${state.nextId++}`, from, to, label: (label || '').trim(), edgeType: edgeTypeId, syntax });
        return;
      }
      return;
    }

    // ── Class diagram ─────────────────────────────────────────────────────
    if (state.diagramType === 'class_diagram') {
      const classMatch = line.match(/^class\s+(\w+)/);
      if (classMatch) {
        const lbl = classMatch[1];
        const id = lbl;
        if (!nodeMap[id]) {
          nodeMap[id] = { id, type: 'class', label: lbl, x, y, w: 160, h: 60, members: [] };
          state.nodes.push(nodeMap[id]);
          x += 200; col++;
          if (col % 3 === 0) { x = 80; y += 100; }
        }
        if (line.includes('<<interface>>')) nodeMap[id].type = 'interface';
        else if (line.includes('<<abstract>>')) nodeMap[id].type = 'abstract';
        else if (line.includes('<<enumeration>>')) nodeMap[id].type = 'enum';
        return;
      }
      // Class relationship line: A <|-- B or A --> B : label
      const relMatch = line.match(/^(\w+)\s+(<\|--|[*o]--|\.\.>|\.\.\|>|-->|--|\.\.)\s+(\w+)(?:\s*:\s*(.+))?/);
      if (relMatch) {
        const [, fromLbl, syntax, toLbl, label] = relMatch;
        [fromLbl, toLbl].forEach(lbl => {
          if (!nodeMap[lbl]) {
            nodeMap[lbl] = { id: lbl, type: 'class', label: lbl, x, y, w: 160, h: 60, members: [] };
            state.nodes.push(nodeMap[lbl]);
            x += 200; col++;
            if (col % 3 === 0) { x = 80; y += 100; }
          }
        });
        const dt2 = DIAGRAM_TYPES.class_diagram;
        const etId = dt2.edgeTypes.find(e => e.syntax === syntax)?.id || 'association';
        state.edges.push({ id: `E${state.nextId++}`, from: fromLbl, to: toLbl, label: (label || '').trim(), edgeType: etId, syntax });
        return;
      }
      return;
    }

    // ── Journey ───────────────────────────────────────────────────────────
    if (state.diagramType === 'journey') {
      const titleMatch = line.match(/^title\s+(.+)$/i);
      if (titleMatch) { state.journeyTitle = titleMatch[1]; return; }
      const sectionMatch = line.match(/^section\s+(.+)$/i);
      if (sectionMatch) {
        const lbl = sectionMatch[1];
        const id = `N${state.nextId++}`;
        const node = { id, type: 'section', label: lbl, x, y, w: 200, h: 36 };
        state.nodes.push(node); nodeMap[id] = node;
        y += 60;
        return;
      }
      const taskMatch = line.match(/^\s*(.+):\s*(\d+):\s*(.+)$/);
      if (taskMatch) {
        const [, lbl, score, actors] = taskMatch;
        const id = `N${state.nextId++}`;
        const node = { id, type: 'task', label: lbl.trim(), x, y, w: 200, h: 50, score: parseInt(score), actors: actors.trim() };
        state.nodes.push(node); nodeMap[id] = node;
        y += 70;
        return;
      }
      return;
    }

    // ── C4 ────────────────────────────────────────────────────────────────
    if (state.diagramType === 'c4') {
      const titleMatch = line.match(/^title\s+(.+)$/i);
      if (titleMatch) { state.c4Title = titleMatch[1]; return; }
      // Person/System declarations
      const c4NodeMatch = line.match(/^(Person_Ext|Person|System_Ext|SystemDb|SystemQueue|System|Boundary)\((\w+),\s*"([^"]*)"(?:,\s*"([^"]*)")?/);
      if (c4NodeMatch) {
        const [, fn, id, lbl, desc] = c4NodeMatch;
        const typeMap = {
          Person: 'c4_person', Person_Ext: 'c4_person_ext',
          System: 'c4_system', System_Ext: 'c4_system_ext',
          SystemDb: 'c4_systemdb', SystemQueue: 'c4_systemqueue',
          Boundary: 'c4_boundary',
        };
        const ntype = typeMap[fn] || 'c4_system';
        const nw = fn === 'Boundary' ? 220 : (fn === 'Person' || fn === 'Person_Ext') ? 100 : 160;
        const nh = fn === 'Boundary' ? 160 : (fn === 'Person' || fn === 'Person_Ext') ? 100 : 90;
        if (!nodeMap[id]) {
          nodeMap[id] = { id, type: ntype, label: lbl, x, y, w: nw, h: nh, desc: desc || '', techn: '' };
          state.nodes.push(nodeMap[id]);
          x += nw + 40; col++;
          if (col % 3 === 0) { x = 80; y += nh + 40; }
        }
        return;
      }
      // Rel declarations
      const relMatch2 = line.match(/^(Rel(?:_Up|_Down|_Left|_Right)?|BiRel)\((\w+),\s*(\w+),\s*"([^"]*)"/);
      if (relMatch2) {
        const [, fn, from, to, label] = relMatch2;
        const dt2 = DIAGRAM_TYPES.c4;
        const etId = dt2.edgeTypes.find(e => e.syntax === fn)?.id || 'rel';
        state.edges.push({ id: `E${state.nextId++}`, from, to, label, edgeType: etId, syntax: fn });
        return;
      }
      return;
    }

    // ── Expanded flowchart @{ syntax ──────────────────────────────────────
    if (state.diagramType === 'expanded_flowchart') {
      const atMatch = line.match(/^(\w+)@\{\s*shape:\s*([\w-]+),?\s*label:\s*"([^"]*)"\s*\}/);
      if (atMatch) {
        const [, id, shapeName, label] = atMatch;
        const shapeMap = {
          'rect': 'ef_proc', 'diam': 'ef_decision', 'cyl': 'ef_db',
          'rounded': 'ef_event', 'stadium': 'ef_terminal', 'doc': 'ef_doc',
          'circle': 'ef_circle', 'dbl-circ': 'ef_dbl', 'hex': 'ef_hex',
          'tri': 'ef_tri', 'hourglass': 'ef_hourglass', 'bolt': 'ef_bolt',
          'lean-r': 'ef_lean_r', 'lean-l': 'ef_lean_l', 'trap-t': 'ef_trap_t',
          'trap-b': 'ef_trap_b', 'manual-input': 'ef_manual', 'lin-doc': 'ef_doc2',
          'notch-rect': 'ef_notch', 'bow-tie': 'ef_bow_tie', 'odd': 'ef_odd',
        };
        const type = shapeMap[shapeName] || 'ef_proc';
        if (!nodeMap[id]) {
          nodeMap[id] = { id, type, label, x, y, w: 120, h: 50 };
          state.nodes.push(nodeMap[id]);
          x += 160; col++;
          if (col % 4 === 0) { x = 80; y += 80; }
        }
        return;
      }
      // Fall through to edge parsing below
    }

    // ── Sequence participant ───────────────────────────────────────────────
    if (state.diagramType === 'sequence') {
      const partMatch = line.match(/^(participant|actor)\s+(\w+)(?:\s*<<(\w+)>>)?(?:\s+as\s+(.+))?/i);
      if (partMatch) {
        const [, keyword, id, stereotype, asLabel] = partMatch;
        const label = asLabel || id;
        let type = keyword.toLowerCase() === 'actor' ? 'actor' : 'participant';
        if (stereotype) {
          const stereoMap = { boundary: 'boundary', control: 'control', entity: 'entity', database: 'database', collections: 'collections', queue: 'queue' };
          type = stereoMap[stereotype.toLowerCase()] || type;
        }
        const nh = type === 'actor' ? 70 : 60;
        if (!nodeMap[id]) {
          nodeMap[id] = { id, type, label, x, y, w: 100, h: nh };
          state.nodes.push(nodeMap[id]);
          x += 140;
        }
        return;
      }
      // Sequence edge: A ->> B: message
      const seqEdgeMatch = line.match(/^(\w+)\s*(<<->>|->>|-->>|-x|--x|-\)|--\)|-->|->)\s*(\w+)\s*:\s*(.*)$/);
      if (seqEdgeMatch) {
        const [, from, syntax, to, label] = seqEdgeMatch;
        [from, to].forEach(id => {
          if (!nodeMap[id]) {
            nodeMap[id] = { id, type: 'participant', label: id, x, y, w: 100, h: 60 };
            state.nodes.push(nodeMap[id]);
            x += 140;
          }
        });
        const dt2 = DIAGRAM_TYPES.sequence;
        const etId = dt2.edgeTypes.find(e => e.syntax === syntax)?.id || 'solid_arrow';
        state.edges.push({ id: `E${state.nextId++}`, from, to, label, edgeType: etId, syntax });
        return;
      }
      return;
    }

    // ── Flowchart / expanded_flowchart edges ──────────────────────────────
    const edgeMatch = line.match(/^(\w+)\s+(--[->.]?[->]?|==+>|-\.-?>?)\|?([^|]*)\|?\s+(\w+)/);
    if (edgeMatch) {
      const [, from, syntax, label, to] = edgeMatch;
      [from, to].forEach(id => {
        if (!nodeMap[id]) {
          nodeMap[id] = { id, type: 'rect', label: id, x, y, w: 120, h: 50 };
          state.nodes.push(nodeMap[id]);
          x += 160; col++;
          if (col % 4 === 0) { x = 80; y += 80; }
        }
      });
      state.edges.push({ id: `E${state.nextId++}`, from, to, label: label.trim(), edgeType: 'arrow', syntax });
      return;
    }

    // ── Flowchart node definition ─────────────────────────────────────────
    const nodeMatch = line.match(/^(\w+)[\[({<]+(.*?)[\])}]+$/);
    if (nodeMatch) {
      const [, id, label] = nodeMatch;
      let type = 'rect';
      if (line.includes('{')) type = 'diamond';
      else if (line.includes('((')) type = 'circle';
      else if (line.includes('([')) type = 'stadium';
      else if (line.includes('(')) type = 'round';
      if (!nodeMap[id]) {
        nodeMap[id] = { id, type, label: label || id, x, y, w: 120, h: 50 };
        state.nodes.push(nodeMap[id]);
        x += 160; col++;
        if (col % 4 === 0) { x = 80; y += 80; }
      }
    }
  });

  render(); updateSource();
}

// ── Import / Export ────────────────────────────────────────────────────
function importFromText() {
  const src = mountedContainer?.querySelector('#me-source')?.value?.trim();
  if (src) parseMermaid(src);
}

function insertIntoMarkdown() {
  const src = toMermaid();
  if (window.SD?.insertMermaid) {
    window.SD.insertMermaid(src, state.sourceTabId, state.sourceMdId);
    setStatus('Inserted into document');
  }
}

function buildExportSVG(pad = 20) {
  // Use getBBox on the canvas group for a tight fit around actual content
  const clone = svgEl.cloneNode(true);
  clone.removeAttribute('tabindex');

  // Remove the connect line and grid bg from export
  clone.querySelector('#me-connect-line')?.remove();
  clone.querySelector('#me-grid-bg')?.remove();

  // Calculate tight bounding box from node positions
  if (state.nodes.length === 0) {
    clone.setAttribute('viewBox', `0 0 400 200`);
    clone.setAttribute('width', '400');
    clone.setAttribute('height', '200');
  } else {
    const minX = Math.min(...state.nodes.map(n => n.x)) - pad;
    const minY = Math.min(...state.nodes.map(n => n.y)) - pad;
    const maxX = Math.max(...state.nodes.map(n => n.x + n.w)) + pad;
    const maxY = Math.max(...state.nodes.map(n => n.y + n.h)) + pad;
    const w = maxX - minX;
    const h = maxY - minY;
    clone.setAttribute('viewBox', `${minX} ${minY} ${w} ${h}`);
    clone.setAttribute('width',  w);
    clone.setAttribute('height', h);
  }

  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = `
    .me-shape { fill:#1f1f22; stroke:#0099ff; stroke-width:1.5; }
    .me-shape.selected { fill:#2a2a2e; stroke:#00d4a0; }
    .me-node-label { fill:#e8e8ec; font-family:monospace; font-size:12px; }
    .me-edge { fill:none; stroke:#0099ff; stroke-width:1.5; }
    .me-edge.dotted { stroke-dasharray:5 3; }
    .me-edge.thick { stroke-width:3; }
    .me-edge-label { fill:#a8a8b0; font-family:monospace; font-size:11px; }
    .me-port { display:none; }
  `;
  clone.insertBefore(style, clone.firstChild);
  return new XMLSerializer().serializeToString(clone);
}

async function exportSVG() {
  const svgSrc = buildExportSVG();
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'diagram.svg',
        types: [{ description: 'SVG Image', accept: { 'image/svg+xml': ['.svg'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(svgSrc);
      await writable.close();
      setStatus('SVG saved');
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  // Fallback
  const blob = new Blob([svgSrc], { type: 'image/svg+xml' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'diagram.svg'; a.click();
  URL.revokeObjectURL(url);
}

async function exportPNG() {
  const svgSrc = buildExportSVG();
  const blob   = new Blob([svgSrc], { type: 'image/svg+xml' });
  const url    = URL.createObjectURL(blob);

  const img  = new Image();
  img.onload = async () => {
    const scale  = 2; // retina
    const canvas = document.createElement('canvas');
    canvas.width  = img.width  * scale;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = '#0e0e0f';
    ctx.fillRect(0, 0, img.width, img.height);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);

    canvas.toBlob(async pngBlob => {
      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: 'diagram.png',
            types: [{ description: 'PNG Image', accept: { 'image/png': ['.png'] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(pngBlob);
          await writable.close();
          setStatus('PNG saved');
          return;
        } catch (e) {
          if (e.name === 'AbortError') return;
        }
      }
      // Fallback
      const a = document.createElement('a');
      a.href = URL.createObjectURL(pngBlob);
      a.download = 'diagram.png'; a.click();
    }, 'image/png');
  };
  img.src = url;
}

// ── Public API ─────────────────────────────────────────────────────────
function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

return {
  mount,
  unmount,
  loadMermaid(src, sourceTabId = null, sourceMdId = null) {
    state.sourceTabId = sourceTabId;
    state.sourceMdId  = sourceMdId;
    parseMermaid(src);
    const srcEl = mountedContainer?.querySelector('#me-source');
    if (srcEl) srcEl.value = src;
    const btn = mountedContainer?.querySelector('#me-btn-insert');
    if (btn) btn.disabled = !sourceTabId;
  },
  getSource: toMermaid,
};

})();
