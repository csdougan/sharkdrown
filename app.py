import base64
import json
import os
import re
import shutil
import subprocess
import tempfile
import yaml
from flask import Flask, render_template, request, jsonify
import markdown
import pymdownx
from flaskwebgui import FlaskUI

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("editor.html")


@app.route("/api/preview", methods=["POST"])
def preview():
    data    = request.get_json()
    text    = data.get("content", "")
    flavor  = data.get("flavor", "standard")

    if flavor == "github":
        extensions = [
            "tables", "fenced_code", "codehilite", "toc",
            "pymdownx.tasklist", "pymdownx.superfences",
            "pymdownx.highlight", "pymdownx.inlinehilite",
            "pymdownx.magiclink", "pymdownx.tilde", "pymdownx.caret",
        ]
    else:
        extensions = [
            "tables", "fenced_code", "codehilite", "toc",
            "pymdownx.superfences",
        ]

    extension_configs = {
        "pymdownx.superfences": {
            "custom_fences": [
                {"name": "mermaid", "class": "mermaid", "format": mermaid_fence}
            ]
        }
    }

    html = markdown.markdown(text, extensions=extensions, extension_configs=extension_configs)
    return jsonify({"html": html})


def mermaid_fence(source, language, class_name, options, md, **kwargs):
    return f'<div class="mermaid">{source}</div>'


# Rules that pymarkdownlnt can auto-fix
FIXABLE_RULES = {
    'md001', 'md004', 'md005', 'md006', 'md007', 'md009', 'md010',
    'md012', 'md019', 'md021', 'md023', 'md027', 'md029', 'md030',
    'md031', 'md035', 'md037', 'md038', 'md039', 'md044', 'md046',
    'md047', 'md048',
}

_ISSUE_RE = re.compile(r'^[^:]+:(\d+):(\d+): (MD\d+): (.+)$')


@app.route("/api/lint", methods=["POST"])
def lint():
    data = request.get_json()
    content = data.get("content", "")
    flavor = data.get("flavor", "standard")

    # Build config to disable flavor-specific rules
    config_content = ""
    if flavor == "github":
        # GFM auto-links bare URLs, so MD034 (no bare URLs) doesn't apply
        config_content = "[plugin MD034]\ndisable=true\n"
    elif flavor == "confluence":
        # Confluence wiki markup handles links and URLs differently
        config_content = "[plugin MD034]\ndisable=true\n"

    try:
        if config_content:
            # Write temp config and use --config flag
            with tempfile.NamedTemporaryFile(mode="w", suffix=".pymd", delete=False) as f:
                f.write(config_content)
                config_path = f.name
            try:
                result = subprocess.run(
                    ["pymarkdown", "--stack-config", config_path, "scan-stdin"],
                    input=content,
                    capture_output=True,
                    text=True,
                    timeout=15,
                )
            finally:
                os.unlink(config_path)
        else:
            result = subprocess.run(
                ["pymarkdown", "scan-stdin"],
                input=content,
                capture_output=True,
                text=True,
                timeout=15,
            )
        issues = []
        for line in result.stdout.splitlines():
            m = _ISSUE_RE.match(line)
            if m:
                rule_id = m.group(3).lower()
                issues.append({
                    "line":    int(m.group(1)),
                    "col":     int(m.group(2)),
                    "rule":    m.group(3),
                    "message": m.group(4),
                    "fixable": rule_id in FIXABLE_RULES,
                })
        return jsonify({"issues": issues})
    except FileNotFoundError:
        return jsonify({"error": "pymarkdown not found — install pymarkdownlnt"}), 500
    except subprocess.TimeoutExpired:
        return jsonify({"error": "Lint timed out"}), 500


@app.route("/api/lint/fix", methods=["POST"])
def lint_fix():
    data    = request.get_json()
    content = data.get("content", "")
    rule    = data.get("rule")          # e.g. "MD009" — fix only this rule; None = fix all
    try:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".md", delete=False) as f:
            f.write(content)
            fname = f.name
        cmd = ["pymarkdown"]
        if rule:
            cmd += ["-d", "all", "-e", rule]
        cmd += ["fix", fname]
        subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        with open(fname, encoding="utf-8") as f:
            fixed = f.read()
        return jsonify({"content": fixed})
    except FileNotFoundError:
        return jsonify({"error": "pymarkdown not found — install pymarkdownlnt"}), 500
    except subprocess.TimeoutExpired:
        return jsonify({"error": "Fix timed out"}), 500
    finally:
        try:
            os.unlink(fname)
        except Exception:
            pass


@app.route("/api/import/epub", methods=["POST"])
def import_epub():
    """Convert an epub file to markdown, extracting all embedded images as base64."""
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400

    epub_file = request.files['file']
    if not epub_file.filename.lower().endswith('.epub'):
        return jsonify({"error": "File must have .epub extension"}), 400

    try:
        tmpdir = tempfile.mkdtemp(prefix="sharkdrown_epub_import_")
        epub_path = os.path.join(tmpdir, "input.epub")
        epub_file.save(epub_path)

        result = subprocess.run(
            ["pandoc", epub_path, "-f", "epub", "-t", "markdown", "--wrap=none"],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode != 0:
            return jsonify({"error": f"Pandoc error: {result.stderr}"}), 500

        markdown_content = result.stdout

        media_dir = os.path.join(tmpdir, "media")
        images = {}
        if os.path.isdir(media_dir):
            for root, _, files in os.walk(media_dir):
                for fname in files:
                    fpath = os.path.join(root, fname)
                    rel_path = os.path.relpath(fpath, tmpdir)
                    with open(fpath, "rb") as f:
                        images[rel_path] = base64.b64encode(f.read()).decode("utf-8")

        return jsonify({"markdown": markdown_content, "images": images})
    except subprocess.TimeoutExpired:
        return jsonify({"error": "Pandoc timed out"}), 500
    except FileNotFoundError:
        return jsonify({"error": "Pandoc is not installed on the server"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


@app.route("/api/export/epub", methods=["POST"])
def export_epub():
    """Convert markdown (with images) to an epub file, returned as base64."""
    data = request.get_json()
    if not data or "markdown" not in data:
        return jsonify({"error": "markdown field is required"}), 400

    markdown_content = data["markdown"]
    images = data.get("images", {})
    filename = data.get("filename", "document")

    try:
        tmpdir = tempfile.mkdtemp(prefix="sharkdrown_epub_export_")

        md_path = os.path.join(tmpdir, "document.md")
        with open(md_path, "w", encoding="utf-8") as f:
            f.write(markdown_content)

        for img_path, b64_data in images.items():
            full_path = os.path.join(tmpdir, img_path)
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            with open(full_path, "wb") as f:
                f.write(base64.b64decode(b64_data))

        epub_path = os.path.join(tmpdir, "output.epub")
        result = subprocess.run(
            ["pandoc", md_path, "-t", "epub", "-o", epub_path, "--standalone"],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode != 0:
            return jsonify({"error": f"Pandoc error: {result.stderr}"}), 500

        with open(epub_path, "rb") as f:
            epub_b64 = base64.b64encode(f.read()).decode("utf-8")

        safe_name = re.sub(r'[^\w\s.-]', '', filename.rsplit('.', 1)[0]) + '.epub'
        return jsonify({"epub": epub_b64, "filename": safe_name})
    except subprocess.TimeoutExpired:
        return jsonify({"error": "Pandoc timed out"}), 500
    except FileNotFoundError:
        return jsonify({"error": "Pandoc is not installed on the server"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


@app.route("/api/lint/html", methods=["POST"])
def lint_html():
    """Lint HTML content using the tidy CLI tool."""
    data = request.get_json()
    content = data.get("content", "")
    try:
        result = subprocess.run(
            ["tidy", "-q", "-e", "--show-warnings", "yes", "--show-errors", "5"],
            input=content.encode("utf-8"), capture_output=True, timeout=30,
        )
        errors = []
        for line in result.stderr.decode("utf-8").splitlines():
            if ":" in line and line.strip():
                errors.append(line.strip())
        return jsonify({"issues": errors})
    except subprocess.TimeoutExpired:
        return jsonify({"error": "HTML lint timed out"}), 500
    except FileNotFoundError:
        return jsonify({"error": "tidy is not installed on the server"}), 500


@app.route("/api/lint/json", methods=["POST"])
def lint_json():
    """Validate JSON content using the python json module."""
    import json as _json
    data = request.get_json()
    content = data.get("content", "")
    try:
        _json.loads(content)
        return jsonify({"issues": []})
    except _json.JSONDecodeError as e:
        return jsonify({"issues": [{
            "line": e.lineno,
            "col": e.colno,
            "rule": "json",
            "message": e.msg,
            "fixable": False,
        }]})


@app.route("/api/format/json", methods=["POST"])
def format_json():
    """Pretty-print JSON content."""
    data = request.get_json()
    content = data.get("content", "")
    try:
        parsed = json.loads(content)
        formatted = json.dumps(parsed, indent=2, ensure_ascii=False)
        return jsonify({"content": formatted})
    except json.JSONDecodeError as e:
        return jsonify({"error": f"Invalid JSON: {e.msg}"}), 400


@app.route("/api/format/yaml", methods=["POST"])
def format_yaml():
    """Pretty-print YAML content."""
    data = request.get_json()
    content = data.get("content", "")
    try:
        parsed = yaml.safe_load(content)
        formatted = yaml.dump(parsed, indent=2, default_flow_style=False, sort_keys=False)
        return jsonify({"content": formatted})
    except yaml.YAMLError as e:
        return jsonify({"error": f"Invalid YAML: {str(e)}"}), 400


@app.route("/api/format/html", methods=["POST"])
def format_html():
    """Pretty-print HTML content using tidy."""
    data = request.get_json()
    content = data.get("content", "")
    try:
        result = subprocess.run(
            ["tidy", "-i", "-q", "-w", "2"],
            input=content.encode("utf-8"),
            capture_output=True,
            text=True,
            timeout=15,
        )
        # tidy outputs formatted HTML to stdout
        formatted = result.stdout
        return jsonify({"content": formatted})
    except subprocess.TimeoutExpired:
        return jsonify({"error": "HTML format timed out"}), 500
    except FileNotFoundError:
        return jsonify({"error": "tidy is not installed on the server"}), 500


@app.route("/api/lint/yaml", methods=["POST"])
def lint_yaml():
    """Lint YAML content using yamllint."""
    data = request.get_json()
    content = data.get("content", "")
    try:
        result = subprocess.run(
            ["yamllint", "-f", "plain", "-"],
            input=content.encode("utf-8"),
            capture_output=True,
            text=True,
            timeout=15,
        )
        issues = []
        for line in result.stdout.splitlines():
            # yamllint plain format: path:line:col: [error|warning] message
            m = re.match(r'([^:]+):(\d+):(\d+): \[(error|warning)\] (.+)', line)
            if m:
                issues.append({
                    "line": int(m.group(2)),
                    "col": int(m.group(3)),
                    "rule": "yaml",
                    "message": m.group(5),
                    "fixable": False,
                })
        return jsonify({"issues": issues})
    except FileNotFoundError:
        return jsonify({"error": "yamllint not found — install yamllint"}), 500
    except subprocess.TimeoutExpired:
        return jsonify({"error": "YAML lint timed out"}), 500


@app.route("/api/export/html", methods=["POST"])
def export_html():
    """Render markdown to HTML and return it for export."""
    data    = request.get_json()
    text    = data.get("content", "")
    flavor  = data.get("flavor", "standard")

    if flavor == "github":
        extensions = [
            "tables", "fenced_code", "codehilite", "toc",
            "pymdownx.tasklist", "pymdownx.superfences",
            "pymdownx.highlight", "pymdownx.inlinehilite",
            "pymdownx.magiclink", "pymdownx.tilde", "pymdownx.caret",
        ]
    else:
        extensions = [
            "tables", "fenced_code", "codehilite", "toc",
            "pymdownx.superfences",
        ]

    extension_configs = {
        "pymdownx.superfences": {
            "custom_fences": [
                {"name": "mermaid", "class": "mermaid", "format": mermaid_fence}
            ]
        }
    }

    html = markdown.markdown(text, extensions=extensions, extension_configs=extension_configs)
    return jsonify({"html": html})


@app.route("/api/import/docx", methods=["POST"])
def import_docx():
    """Convert a Word DOCX file to markdown using pandoc."""
    if 'file' not in request.files:
        return jsonify({"error": "No file provided"}), 400
    docx_file = request.files['file']
    if not docx_file.filename.lower().endswith('.docx'):
        return jsonify({"error": "File must have .docx extension"}), 400
    try:
        tmpdir = tempfile.mkdtemp(prefix="sharkdrown_docx_import_")
        docx_path = os.path.join(tmpdir, "input.docx")
        docx_file.save(docx_path)
        result = subprocess.run(
            ["pandoc", docx_path, "-f", "docx", "-t", "markdown", "--wrap=none"],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode != 0:
            return jsonify({"error": f"Pandoc error: {result.stderr}"}), 500
        return jsonify({"markdown": result.stdout})
    except subprocess.TimeoutExpired:
        return jsonify({"error": "Pandoc timed out"}), 500
    except FileNotFoundError:
        return jsonify({"error": "Pandoc is not installed on the server"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


@app.route("/api/export/docx", methods=["POST"])
def export_docx():
    """Convert markdown (with images) to a DOCX file using pandoc, returned as base64."""
    data = request.get_json()
    if not data or "markdown" not in data:
        return jsonify({"error": "markdown field is required"}), 400

    markdown_content = data["markdown"]
    images = data.get("images", {})
    filename = data.get("filename", "document")

    try:
        tmpdir = tempfile.mkdtemp(prefix="sharkdrown_docx_export_")

        md_path = os.path.join(tmpdir, "document.md")
        with open(md_path, "w", encoding="utf-8") as f:
            f.write(markdown_content)

        for img_path, b64_data in images.items():
            full_path = os.path.join(tmpdir, img_path)
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            with open(full_path, "wb") as f:
                f.write(base64.b64decode(b64_data))

        docx_path = os.path.join(tmpdir, "output.docx")
        result = subprocess.run(
            ["pandoc", md_path, "-t", "docx", "-o", docx_path],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode != 0:
            return jsonify({"error": f"Pandoc error: {result.stderr}"}), 500

        with open(docx_path, "rb") as f:
            docx_b64 = base64.b64encode(f.read()).decode("utf-8")

        safe_name = re.sub(r'[^\w\s.-]', '', filename.rsplit('.', 1)[0]) + '.docx'
        return jsonify({"docx": docx_b64, "filename": safe_name})
    except subprocess.TimeoutExpired:
        return jsonify({"error": "Pandoc timed out"}), 500
    except FileNotFoundError:
        return jsonify({"error": "Pandoc is not installed on the server"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


@app.route("/api/convert/json-to-yaml", methods=["POST"])
def convert_json_to_yaml():
    """Convert JSON content to YAML."""
    data = request.get_json()
    content = data.get("content", "")
    try:
        parsed = json.loads(content)
        yaml_content = yaml.dump(parsed, default_flow_style=False, sort_keys=False)
        return jsonify({"content": yaml_content})
    except json.JSONDecodeError as e:
        return jsonify({"error": f"Invalid JSON: {e.msg}"}), 400


@app.route("/api/convert/yaml-to-json", methods=["POST"])
def convert_yaml_to_json():
    """Convert YAML content to JSON."""
    data = request.get_json()
    content = data.get("content", "")
    try:
        parsed = yaml.safe_load(content)
        json_content = json.dumps(parsed, indent=2, ensure_ascii=False)
        return jsonify({"content": json_content})
    except yaml.YAMLError as e:
        return jsonify({"error": f"Invalid YAML: {str(e)}"}), 400


if __name__ == "__main__":
    #app.run(debug=True, host="0.0.0.0", port=5000) 
    FlaskUI(app, width=500, height=500).run()

