import os
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


if __name__ == "__main__":
    app.run(debug=True, port=5000)
