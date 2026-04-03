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
      { id: 'actor',      label: 'Actor',       preview: '☺', mermaid: (id,lbl) => `participant ${id} as ${lbl}` },
      { id: 'actor_box',  label: 'Actor (box)', preview: '▭', mermaid: (id,lbl) => `actor ${id} as ${lbl}` },
    ],
    edgeTypes: [
      { id: 'solid',    label: '→ Solid',       syntax: '->>' },
      { id: 'dotted',   label: '⇢ Dotted',      syntax: '-->>' },
      { id: 'solid_x',  label: '→ Solid (X)',   syntax: '-x' },
      { id: 'async',    label: '→ Async',        syntax: '-)' },
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
    <div class="me-edge-group">
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

// ── Event binding ──────────────────────────────────────────────────────
function bindEvents() {
  diagramTypeSelect.addEventListener('change', () => {
    state.diagramType = diagramTypeSelect.value;
    state.nodes = []; state.edges = []; state.selected.clear();
    state.connecting = null; state.pendingShape = null; state.nextId = 1;
    populateShapes(mountedContainer);
    populateEdgeTypes(mountedContainer);
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
  const isCircular = state.pendingShape === 'circle' || state.pendingShape === 'dbl_circle';
  const nw = 120, nh = isCircular ? 60 : 50;
  const node  = {
    id:    `N${state.nextId++}`,
    type:  state.pendingShape,
    label,
    x:     pt.x - nw / 2,
    y:     pt.y - nh / 2,
    w:     isCircular ? 60 : nw,
    h:     nh,
  };
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
  if (!node) { propsEl.innerHTML = ''; return; }

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
    </div>`;

  propsEl.querySelector('#me-prop-label').addEventListener('input', e => {
    node.label = e.target.value; render(); updateSource();
  });
  propsEl.querySelector('#me-prop-w').addEventListener('input', e => {
    node.w = parseInt(e.target.value) || node.w; render();
  });
  propsEl.querySelector('#me-prop-h').addEventListener('input', e => {
    node.h = parseInt(e.target.value) || node.h; render();
  });
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

function drawNode(node) {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', 'me-node' + (state.selected.has(node.id) ? ' selected' : ''));
  g.setAttribute('data-node-id', node.id);
  g.setAttribute('transform', `translate(${node.x},${node.y})`);

  const shape = shapeForNode(node);
  g.appendChild(shape);

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

  const header = lines[0].toLowerCase();
  if (header.startsWith('flowchart') || header.startsWith('graph')) {
    state.diagramType = 'flowchart';
  } else if (header.startsWith('sequencediagram')) {
    state.diagramType = 'sequence';
  } else if (header.startsWith('statediagram')) {
    state.diagramType = 'state';
  } else if (header.startsWith('erdiagram')) {
    state.diagramType = 'er';
  }

  if (mountedContainer) {
    diagramTypeSelect.value = state.diagramType;
    populateShapes(mountedContainer);
    populateEdgeTypes(mountedContainer);
  }

  let x = 80, y = 80, col = 0;
  const nodeMap = {};

  lines.slice(1).forEach(line => {
    // ER entity definition: Customer {
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
      // ER edge: Customer ||--o{ Order : places
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

    // Edge: A --> B or A -->|label| B
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

    // Node definition: A[Label] A(Label) A{Label} etc
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

    // Sequence participant
    const partMatch = line.match(/^(?:participant|actor)\s+(\w+)(?:\s+as\s+(.+))?/i);
    if (partMatch) {
      const id = partMatch[1], label = partMatch[2] || partMatch[1];
      if (!nodeMap[id]) {
        nodeMap[id] = { id, type: 'actor', label, x, y, w: 100, h: 60 };
        state.nodes.push(nodeMap[id]);
        x += 140;
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
