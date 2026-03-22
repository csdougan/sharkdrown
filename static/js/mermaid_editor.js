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
      { id: 'rect',     label: 'Rectangle',   preview: '▭', mermaid: (id,lbl) => `${id}[${lbl}]` },
      { id: 'round',    label: 'Round',        preview: '▬', mermaid: (id,lbl) => `${id}(${lbl})` },
      { id: 'stadium',  label: 'Stadium',      preview: '⬭', mermaid: (id,lbl) => `${id}([${lbl}])` },
      { id: 'diamond',  label: 'Diamond',      preview: '◇', mermaid: (id,lbl) => `${id}{${lbl}}` },
      { id: 'hex',      label: 'Hexagon',      preview: '⬡', mermaid: (id,lbl) => `${id}{{${lbl}}}` },
      { id: 'circle',   label: 'Circle',       preview: '○', mermaid: (id,lbl) => `${id}((${lbl}))` },
      { id: 'db',       label: 'Database',     preview: '⊍', mermaid: (id,lbl) => `${id}[(${lbl})]` },
      { id: 'para',     label: 'Parallelogram',preview: '▱', mermaid: (id,lbl) => `${id}[/${lbl}/]` },
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
  selected:     new Set(),
  clipboard:    null,
  connecting:   null, // { fromId } when drawing an edge
  dragging:     null, // { nodeId, startX, startY, origPositions }
  nextId:       1,
  edgeType:     'arrow',
  pendingShape: null, // shape to place on next canvas click
  sourceTabId:  null, // markdown tab this diagram came from
  sourceMdId:   null, // index of mermaid block in that tab
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
    <span class="me-sep"></span>
    <button class="me-btn" id="me-btn-delete"   title="Delete selected (Del)">🗑</button>
    <button class="me-btn" id="me-btn-clear"    title="Clear all">✕ Clear</button>
    <span class="me-sep"></span>
    <button class="me-btn me-btn-accent" id="me-btn-import" title="Import Mermaid syntax">⬆ Import</button>
    <button class="me-btn me-btn-accent" id="me-btn-insert" title="Insert into markdown tab">⬇ Insert</button>
    <span class="me-sep"></span>
    <button class="me-btn" id="me-btn-svg"  title="Export SVG">↓ SVG</button>
    <button class="me-btn" id="me-btn-png"  title="Export PNG">↓ PNG</button>
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
  svgEl.style.cursor = '';
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
  console.log('[ME] click - suppressNextClick:', suppressNextClick, 'connecting:', JSON.stringify(state.connecting), 'target:', e.target.className?.baseVal || e.target.className);
  if (suppressNextClick) { suppressNextClick = false; console.log('[ME] suppressed'); return; }
  const nodeEl = e.target.closest('.me-node');

  // Complete a pending connection — triggered by clicking any part of the target node
  // including its ports
  if (state.connecting) {
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
      setStatus('Connection cancelled');
    }
    state.connecting = null;
    svgEl.style.cursor = '';
    render();
    return;
  }

  // Port clicks outside connecting mode start a connection (same as port mousedown)
  if (e.target.classList.contains('me-port')) {
    const fromNodeEl = e.target.closest('.me-node');
    if (fromNodeEl) {
      state.connecting = { fromId: fromNodeEl.dataset.nodeId };
      svgEl.style.cursor = 'crosshair';
      setStatus('Click another node to connect — Escape to cancel');
    }
    return;
  }

  // Place a new node on background click
  if (nodeEl) return;
  if (!state.pendingShape) return;

  const pt    = getSVGPoint(e);
  const shape = DIAGRAM_TYPES[state.diagramType].shapes.find(s => s.id === state.pendingShape);
  if (!shape) return;

  const label = `Node ${state.nextId}`;
  const node  = {
    id:    `N${state.nextId++}`,
    type:  state.pendingShape,
    label,
    x:     pt.x - 60,
    y:     pt.y - 25,
    w:     120,
    h:     50,
  };
  state.nodes.push(node);
  clearPendingShape();
  render();
  updateSource();
  selectNode(node.id, false);
  showProps(node.id);
}

let dragState = null;
let suppressNextClick = false;

function onCanvasMouseDown(e) {
  if (e.target.classList.contains('me-port')) return; // port has its own handler
  const nodeEl = e.target.closest('.me-node');
  if (!nodeEl) return;

  // If connecting, don't start a drag — completion is handled in onClick
  if (state.connecting) return;

  const nodeId = nodeEl.dataset.nodeId;
  const node   = state.nodes.find(n => n.id === nodeId);
  if (!node) return;

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
  if (!dragState) return;
  const pt    = getSVGPoint(e);
  const dx    = pt.x - dragState.startX;
  const dy    = pt.y - dragState.startY;
  dragState.moved = true;

  Object.entries(dragState.origPositions).forEach(([id, orig]) => {
    const n = state.nodes.find(x => x.id === id);
    if (n) { n.x = orig.x + dx; n.y = orig.y + dy; }
  });
  render();
}

function onCanvasMouseUp(e) {
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
  if (e.key === 'Escape' && state.connecting) {
    state.connecting = null;
    svgEl.style.cursor = '';
    setStatus('Connection cancelled');
    return;
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
  if (!multi) state.selected.clear();
  if (state.selected.has(id)) state.selected.delete(id);
  else state.selected.add(id);
  render();
}

function deleteSelected() {
  state.nodes  = state.nodes.filter(n => !state.selected.has(n.id));
  state.edges  = state.edges.filter(e =>
    !state.selected.has(e.from) && !state.selected.has(e.to));
  state.selected.clear();
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
  // Remove existing nodes and edges (keep defs and grid bg)
  canvasG.querySelectorAll('.me-node, .me-edge, .me-edge-label').forEach(el => el.remove());

  // Draw edges first (behind nodes)
  state.edges.forEach(drawEdge);

  // Draw nodes
  state.nodes.forEach(drawNode);
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
  text.textContent = node.label;
  g.appendChild(text);

  // Connection port handles — one on each side, shown on hover
  const ports = [
    { cx: node.w / 2, cy: 0 },           // top
    { cx: node.w,     cy: node.h / 2 },  // right
    { cx: node.w / 2, cy: node.h },      // bottom
    { cx: 0,          cy: node.h / 2 },  // left
  ];
  ports.forEach(pt => {
    const port = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    port.setAttribute('cx', pt.cx);
    port.setAttribute('cy', pt.cy);
    port.setAttribute('r', '5');
    port.setAttribute('class', 'me-port');
    port.addEventListener('mousedown', e => {
      e.stopPropagation();
      state.connecting = { fromId: node.id };
      suppressNextClick = true;
      svgEl.style.cursor = 'crosshair';
      console.log('[ME] port mousedown - set connecting to:', node.id, 'suppressNextClick:', suppressNextClick);
      setStatus('Click another node to connect — Escape to cancel');
    });
    g.appendChild(port);
  });

  g.addEventListener('dblclick', () => editLabel(node.id));

  canvasG.appendChild(g);
}

function shapeForNode(node) {
  const { type, w, h } = node;
  const sel = state.selected.has(node.id);

  if (type === 'diamond') {
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', `${w/2},0 ${w},${h/2} ${w/2},${h} 0,${h/2}`);
    poly.setAttribute('class', 'me-shape' + (sel ? ' selected' : ''));
    return poly;
  }
  if (type === 'circle') {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    circle.setAttribute('cx', w / 2); circle.setAttribute('cy', h / 2);
    circle.setAttribute('rx', w / 2); circle.setAttribute('ry', h / 2);
    circle.setAttribute('class', 'me-shape' + (sel ? ' selected' : ''));
    return circle;
  }
  if (type === 'hex') {
    const hw = w / 2, hh = h / 2, off = w * 0.15;
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points',
      `${off},0 ${w-off},0 ${w},${hh} ${w-off},${h} ${off},${h} 0,${hh}`);
    poly.setAttribute('class', 'me-shape' + (sel ? ' selected' : ''));
    return poly;
  }
  if (type === 'para') {
    const off = w * 0.15;
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', `${off},0 ${w},0 ${w-off},${h} 0,${h}`);
    poly.setAttribute('class', 'me-shape' + (sel ? ' selected' : ''));
    return poly;
  }
  // Default: rect (with rx for round/stadium)
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('width', w); rect.setAttribute('height', h);
  const rx = type === 'round' ? 8 : type === 'stadium' ? h / 2 : type === 'db' ? 8 : 4;
  rect.setAttribute('rx', rx); rect.setAttribute('ry', rx);
  rect.setAttribute('class', 'me-shape' + (sel ? ' selected' : ''));
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

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const mx   = (x1 + x2) / 2, my = (y1 + y2) / 2 - 20;
  path.setAttribute('d', `M${x1},${y1} Q${mx},${my} ${x2},${y2}`);
  path.setAttribute('class', 'me-edge' + (edge.edgeType === 'dotted' ? ' dotted' : edge.edgeType === 'thick' ? ' thick' : ''));
  path.setAttribute('marker-end', 'url(#me-arrow)');
  canvasG.insertBefore(path, canvasG.querySelector('.me-node'));

  if (edge.label) {
    const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    txt.setAttribute('x', mx); txt.setAttribute('y', my - 4);
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

function exportSVG() {
  const src    = buildExportSVG();
  const blob   = new Blob([src], { type: 'image/svg+xml' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href = url; a.download = 'diagram.svg'; a.click();
  URL.revokeObjectURL(url);
}

function buildExportSVG() {
  // Clone the canvas SVG with inline styles
  const clone = svgEl.cloneNode(true);
  clone.removeAttribute('tabindex');
  const bbox  = canvasG.getBBox();
  const pad   = 20;
  clone.setAttribute('viewBox',
    `${bbox.x - pad} ${bbox.y - pad} ${bbox.width + pad*2} ${bbox.height + pad*2}`);
  clone.setAttribute('width',  bbox.width  + pad * 2);
  clone.setAttribute('height', bbox.height + pad * 2);
  // Embed basic styles
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = `
    .me-shape { fill:#1f1f22; stroke:#00d4a0; stroke-width:1.5; }
    .me-node-label { fill:#e8e8ec; font-family:monospace; font-size:13px; }
    .me-edge { fill:none; stroke:#0099ff; stroke-width:1.5; }
    .me-edge-label { fill:#a8a8b0; font-family:monospace; font-size:11px; }
  `;
  clone.insertBefore(style, clone.firstChild);
  return new XMLSerializer().serializeToString(clone);
}

function exportPNG() {
  const svgSrc = buildExportSVG();
  const img    = new Image();
  const blob   = new Blob([svgSrc], { type: 'image/svg+xml' });
  const url    = URL.createObjectURL(blob);
  img.onload   = () => {
    const canvas    = document.createElement('canvas');
    canvas.width    = img.width  || 800;
    canvas.height   = img.height || 600;
    const ctx       = canvas.getContext('2d');
    ctx.fillStyle   = '#0e0e0f';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'diagram.png';
    a.click();
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
