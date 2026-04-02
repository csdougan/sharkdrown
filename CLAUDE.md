# SharkDrown — Claude Code Project Context

## What this project is

SharkDrown is a browser-based Markdown editor built for developers and sysadmins. It runs as a stateless Python/Flask container. All user state lives in the browser (`localStorage`) — the server has no session state, no database, and no file storage. It is designed to be deployed to Kubernetes without sticky sessions or PVCs.

The name is a pun: awk → rawk → shark → SharkDrown.

## Repository

https://github.com/csdougan/sharkdrown

## Tech stack

| Layer | Technology |
|-------|-----------|
| Server | Python 3.12, Flask 3.x, Gunicorn, pymdownx, pymarkdownlnt, yamllint, PyYAML |
| Client | Vanilla JS (no bundler, no framework), CSS custom properties |
| Preview rendering | highlight.js 11.9 (CDN), Mermaid.js (CDN), Turndown (CDN) |
| Container | Python 3.12-slim base + pandoc + tidy (system packages) |
| CI/CD | GitHub Actions → GHCR (multi-platform: linux/amd64, linux/arm64) |

## Project structure

```
sharkdrown/
├── app.py                          # Flask app — 12 routes total
├── requirements.txt                # flask, markdown, pymdownx, pygments, html2text, pymarkdownlnt, yamllint, pyyaml
├── Dockerfile                      # python:3.12-slim + pandoc + tidy
├── templates/
│   └── editor.html                 # Full SPA shell — all DOM, toolbar, tabs, panes, modals
├── static/
│   ├── css/
│   │   └── editor.css              # All styles — CSS custom properties
│   ├── js/
│   │   ├── editor.js               # Core editor — wrapped in IIFE
│   │   ├── transform.js            # Transform panel operations — IIFE
│   │   ├── filter.js               # Line filter bar — IIFE
│   │   ├── lint.js                 # Markdown/HTML/YAML/JSON linting panel — IIFE
│   │   └── mermaid_editor.js       # Visual Mermaid diagram editor — IIFE
│   └── images/
│       └── sharkdrown_banner.png   # Banner shown on empty state
```

## Server (app.py)

Fifteen routes:

- `GET /` → renders `editor.html`
- `POST /api/preview` → accepts `{ content: string, flavor: "standard"|"github" }`, returns `{ html: string }`
- `POST /api/lint` → markdown lint via pymarkdownlnt CLI (supports `flavor` param: standard|github|confluence)
- `POST /api/lint/fix` → auto-fix markdown lint issues
- `POST /api/lint/html` → HTML lint via tidy CLI
- `POST /api/lint/json` → JSON validation via python json module
- `POST /api/lint/yaml` → YAML lint via yamllint CLI
- `POST /api/format/json` → pretty-print JSON via python json module
- `POST /api/format/yaml` → pretty-print YAML via PyYAML
- `POST /api/format/html` → pretty-print HTML via tidy
- `POST /api/export/html` → markdown → HTML (same renderer as preview)
- `POST /api/export/epub` → markdown (+images) → base64 epub via pandoc
- `POST /api/export/docx` → markdown (+images) → base64 docx via pandoc
- `POST /api/import/epub` → epub → markdown + images base64 via pandoc
- `POST /api/import/docx` → docx → markdown via pandoc
- `POST /api/convert/json-to-yaml` → JSON content → YAML via PyYAML
- `POST /api/convert/yaml-to-json` → YAML content → JSON via PyYAML

All subprocess-based conversions use `tempfile.mkdtemp` with `shutil.rmtree` cleanup in `finally`.

## JavaScript architecture

All five JS files are wrapped in IIFEs (`(function() { ... })()`). They communicate via `window.SD` (set by `editor.js`), `window.SD_filter` (set by `filter.js`), `window.MermaidEditor` (set by `mermaid_editor.js`), and `window.SD_lint` (set by `lint.js`).

### editor.js

The core module. Manages:
- **Tab state**: each tab is `{ id, name, content, isDirty, fileHandle, scrollTop, format, type }`. Six tab types: `markdown` (default), `mermaid` (diagram tabs with `diagramSrc, sourceTabId, sourceMdId`), `html` (raw HTML), `yaml`, `json`, and `plaintext`.
- **View modes**: `split` (resizable side-by-side), `code` (textarea only), `wysiwyg` (preview editable), `mermaid` (diagram editor pane)
- **File I/O**: File System Access API (`showOpenFilePicker`, `showSaveFilePicker`) — Chrome/Edge only. Supports `.md`, `.markdown`, `.yml`, `.yaml`, `.json`, `.jsonc`, `.htm`, `.html`, `.txt`, `.docx`, `.epub`.
- **File type detection**: Extension-based detection on open. HTML files show a modal with radio options (open as HTML code / convert to Markdown). Unknown extensions show a modal with a dropdown to select file type.
- **New file**: Prompts for format (markdown, github-markdown, confluence, html, yaml, json, plaintext) before creating a tab.
- **Format conversion**: JSON↔YAML via server endpoints (`/api/convert/json-to-yaml`, `/api/convert/yaml-to-json`).
- **Persistence**: `localStorage` for tabs, settings, view, format, line numbers
- **Preview**: debounced POST to `/api/preview`, 300ms debounce. HTML tabs render raw HTML directly. YAML/JSON/plaintext render as `<pre>` blocks. Markdown tabs use standard/GFM/Confluence flavor.
- **Syntax highlighting**: hljs overlay with idle debounce. Markdown uses `language-markdown`; HTML uses `language-html`; JSON uses `language-json`; YAML uses `language-yaml`; plaintext has no highlighting.
- **`window.SD`**: exposes `{ editor, schedulePreview, isWysiwyg, activeTab, insertMermaid }`

Key `localStorage` keys (defined in `LS` constant):
```
sd_tabs, sd_active_tab, sd_theme, sd_font, sd_split, sd_view, sd_format, sd_line_nums
```

### transform.js

The transform panel. All operations work on either the full document or the current selection (controlled by the `#tp-scope` checkbox). Tabs: Prefix/Suffix, Find/Replace, Fields, Whitespace, Ctrl Chars, Lines, Reformat.

Reads/writes to the editor via `window.SD.editor.value` and dispatches an `input` event to trigger the normal update pipeline.

### filter.js

The non-destructive line filter bar. Exposes `window.SD_filter = { reset(), isActive() }`.

When active: saves the full document content, sets the textarea to read-only, shows only matching lines. When deactivated: restores the saved content. The filter is reset automatically on tab switch (editor.js calls `window.SD_filter.reset()` in `switchTab`).

Eight conditions: contains, does not contain, equals, does not equal, begins with, does not begin with, ends with, does not end with. Multiple rows combine with AND or OR.

### mermaid_editor.js

Visual SVG diagram editor. Exposes `window.MermaidEditor = { mount(el), unmount(), loadMermaid(src, sourceTabId, sourceMdId), getSource() }`.

Supports four diagram types: flowchart, sequence, state, ER. Uses SVG `<g>` elements for nodes, `<path>` for edges. Port handles (small circles on node hover) initiate connections via mousedown+drag+mouseup. Copy/paste via Ctrl+C/V or context menu. Export via `showSaveFilePicker`.

The `insertMermaid(src, sourceTabId, sourceMdId)` function on `window.SD` updates the nth mermaid block in the source markdown tab.

### lint.js

The linting panel. Routes to the appropriate endpoint based on tab type:

- `markdown` → `/api/lint` with `tab.format` as flavor (standard|github|confluence)
- `html` → `/api/lint/html` (tidy)
- `yaml` → `/api/lint/yaml` (yamllint)
- `json` → `/api/lint/json` (python json validation)
- `plaintext` → displays "Plain text has no linter"

- Reads the active tab via `window.SD.activeTab()` to detect tab type and format
- Markdown issues: `{ line, col, rule, message, fixable }` — with Fix buttons for fixable rules
- HTML/YAML/JSON issues: structured objects with rule, message, line, col
- Displays issues in a resizable pane below the editor, click to navigate to line

## CSS architecture (editor.css)

Uses CSS custom properties (`--var`) for all colours, fonts, and spacing. Theme switching is done by setting `data-theme` on `<html>` (values: `dark`, `light`, `hc`, `warm`).

Key variables:
```css
--font-ui: Syne (topbar/UI chrome)
--font-mono: JetBrains Mono (editor textarea and overlay — MUST MATCH)
--font-preview: set by JS from Google Fonts
--bg0, --bg1, --bg2, --bg3: background ramp
--text0, --text1, --text2: text ramp
--accent, --accent2: primary and secondary accent colours
--border, --danger, --radius
--topbar-h, --tabbar-h, --toolbar-h, --status-h: grid row heights
```

The layout is a 5-row CSS grid: `topbar / tabbar / toolbar / workspace / statusbar`.

The workspace is a CSS grid itself: `view-split` (1fr 4px 1fr), `view-code` (1fr), `view-wysiwyg` (1fr), `view-mermaid` (1fr). These classes are set on `#workspace` by `setView()` in editor.js.

### hljs overlay

The syntax highlighting overlay (`#hljs-overlay`) is an absolutely-positioned `<pre>` that covers the textarea. When active, `#editor-wrap.hljs-active #editor { color: transparent }` hides the textarea text and the overlay provides coloured text. Critical: the overlay MUST use `font-family: var(--font-mono)` with `!important` on `.hljs` — otherwise the hljs theme CSS overrides it with plain `monospace` causing a visual font-size jump between highlighted and unhighlighted states.

During typing: overlay is hidden (`visibility: hidden`) and `hljs-active` is removed so the textarea text is visible. After 800ms idle: overlay is updated and shown.

## Known issues / deferred features

- `static/images/sharkdrown_banner.png` is a placeholder — should be replaced with a proper banner
- Mermaid visual editor connection: connect by pressing mousedown on a port handle, dragging to target node, releasing. The `suppressNextClick` approach was tried and abandoned — the current implementation uses `onCanvasMouseUp` for connection completion.
- Mermaid parser (for importing existing diagrams) is basic — handles flowchart and sequence reasonably, state and ER are partially supported
- Firefox: File System Access API not available — file open/save shows an error, editing/preview work
- No tests directory exists yet — `tests/` needs creating. The CI workflow has `continue-on-error: true` on the test step for this reason.

## CI/CD pipeline

`.github/workflows/build.yml` — jobs:
1. **lint**: `py_compile` + `pylint --fail-under=7.0`
2. **test**: `pytest tests/` with coverage (needs `tests/` directory)
3. **build**: Docker Buildx multi-platform (amd64+arm64), push to GHCR. Tags: branch name, `sha-<sha>`, semver on tags, `latest` on main only
4. **scan**: Trivy on pushed image, SARIF to GitHub Security tab
5. **smoke-test** (PR only): Kind cluster, deploy, curl `/healthz` and `/`

GHCR image: `ghcr.io/csdougan/sharkdrown`

## Running locally

```bash
pip install -r requirements.txt
python app.py
# → http://localhost:5000
```

```bash
docker build -t sharkdrown .
docker run -p 5000:5000 sharkdrown
```

## Kubernetes deployment notes

- Stateless — no sticky sessions, no PVC needed
- All user data in browser localStorage
- Spot nodes are appropriate (stateless, client retries on eviction)
- 2 replicas per region minimum, spread across AZs
- Target: 2 Azure regions with Akamai GTM for traffic routing
- Secrets via HashiCorp Vault (Maersk Secret Store) with OIDC federation — no secrets in GitHub Secrets
- Python deps from devpi-server internal PyPI mirror (supply chain protection)
- Ingress: Traefik or Nginx Ingress
- Observability: Prometheus + Grafana per region

## Coding conventions

- No docstrings or inline comments on existing code unless adding new functions
- All JS wrapped in IIFEs
- No JS bundler — all scripts loaded as separate `<script>` tags in order: `mermaid_editor.js`, `editor.js`, `filter.js`, `transform.js`, `lint.js`
- CSS uses `var(--token)` for every colour, spacing, and font — no hardcoded values except in the hljs override rules
- `persist()` is debounced via `schedulePersist()` (500ms) on keystroke — call `persist()` directly only for discrete user actions (tab switch, save, format change)
- `updateStats()` is debounced via `scheduleStats()` (300ms) on keystroke
- `updateLineNumbers()` is debounced via `scheduleLineNumbers()` (200ms) on keystroke
- Tab objects: always check `tab.type` before accessing fields — `mermaid` tabs have `diagramSrc` instead of `content`; `html`, `yaml`, `json`, `plaintext` tabs all use `content` as their content

## Features complete

- Multi-tab editor with dirty tracking and localStorage persistence (markdown, mermaid, HTML, YAML, JSON, plaintext tab types)
- Three view modes: code, split (resizable), wysiwyg
- File open/save via File System Access API with extension-based type detection
- New file creation with format selection modal
- Markdown syntax toolbar
- Syntax highlighting overlay (hljs, idle-only; markdown, HTML, JSON, YAML grammars)
- Live preview via /api/preview (300ms debounce)
- Format dropdown: Standard MD, GFM, Confluence, HTML, JSON, YAML, Plain Text
- JSON↔YAML bidirectional conversion
- Line numbers (toggleable, scroll-synced)
- 4 themes, 8 preview fonts
- Transform panel: Prefix/Suffix, Find/Replace, Fields, Whitespace, Ctrl Chars, Lines, Reformat
- Non-destructive line filter bar with 8 conditions and AND/OR logic
- Visual Mermaid diagram editor (Flowchart, Sequence, State, ER)
- Mermaid export: SVG and PNG with tight bounding box and showSaveFilePicker
- Click Mermaid diagram in preview to open in visual editor, Insert back to source
- HTML tabs: open as code (code view) or convert to Markdown; syntax highlighting; linting (tidy)
- YAML tabs: open, edit, syntax highlight, save, lint (yamllint)
- JSON tabs: open, edit, syntax highlight, save, lint (json validation)
- Plaintext tabs: open, edit, save
- Markdown linting with auto-fix (pymarkdownlnt) — flavor-specific rules
- Linting: Markdown (pymarkdownlnt), HTML (tidy), YAML (yamllint), JSON (json validation)
- Import: EPUB → markdown, DOCX → markdown, HTML → HTML tab or convert to Markdown
- Export: markdown → EPUB, markdown → DOCX, markdown → HTML

## Features planned / not yet started

- Tests directory and pytest test suite
- /healthz endpoint (needed for Kubernetes probes and CI smoke tests)
- Playwright UAT tests
- Inspec infrastructure compliance profile
- Kubernetes Helm chart
- Multi-user server-backed sessions (currently localStorage only)
