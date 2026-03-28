import os
import re
import subprocess
import tempfile
from flask import Flask, render_template, request, jsonify
import markdown
import pymdownx

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
    content = request.get_json().get("content", "")
    try:
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


if __name__ == "__main__":
    app.run(debug=True, port=5000)
