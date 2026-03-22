import os
from flask import Flask, render_template, request, jsonify, send_from_directory
import markdown
import pymdownx

app = Flask(__name__)
DOCUMENTS_DIR = os.path.join(os.path.dirname(__file__), "documents")
os.makedirs(DOCUMENTS_DIR, exist_ok=True)


@app.route("/")
def index():
    return render_template("editor.html")


@app.route("/api/files", methods=["GET"])
def list_files():
    files = [f for f in os.listdir(DOCUMENTS_DIR) if f.endswith(".md")]
    return jsonify(sorted(files))


@app.route("/api/files/<filename>", methods=["GET"])
def read_file(filename):
    path = os.path.join(DOCUMENTS_DIR, filename)
    if not os.path.isfile(path):
        return jsonify({"error": "Not found"}), 404
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    return jsonify({"content": content})


@app.route("/api/files/<filename>", methods=["PUT"])
def write_file(filename):
    data = request.get_json()
    content = data.get("content", "")
    path = os.path.join(DOCUMENTS_DIR, filename)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return jsonify({"ok": True})


@app.route("/api/files/<filename>", methods=["DELETE"])
def delete_file(filename):
    path = os.path.join(DOCUMENTS_DIR, filename)
    if os.path.isfile(path):
        os.remove(path)
    return jsonify({"ok": True})


@app.route("/api/files/<filename>/rename", methods=["POST"])
def rename_file(filename):
    data = request.get_json()
    new_name = data.get("name", "").strip()
    if not new_name:
        return jsonify({"error": "Name required"}), 400
    if not new_name.endswith(".md"):
        new_name += ".md"
    src = os.path.join(DOCUMENTS_DIR, filename)
    dst = os.path.join(DOCUMENTS_DIR, new_name)
    if not os.path.isfile(src):
        return jsonify({"error": "Not found"}), 404
    os.rename(src, dst)
    return jsonify({"name": new_name})


@app.route("/api/preview", methods=["POST"])
def preview():
    data = request.get_json()
    text = data.get("content", "")
    flavor = data.get("flavor", "standard")

    if flavor == "github":
        extensions = [
            "tables", "fenced_code", "codehilite", "toc",
            "pymdownx.tasklist", "pymdownx.superfences",
            "pymdownx.highlight", "pymdownx.inlinehilite",
            "pymdownx.magiclink", "pymdownx.tilde", "pymdownx.caret",
        ]
        extension_configs = {
            "pymdownx.superfences": {
                "custom_fences": [
                    {"name": "mermaid", "class": "mermaid", "format": mermaid_fence}
                ]
            }
        }
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


if __name__ == "__main__":
    app.run(debug=True, port=5000)
