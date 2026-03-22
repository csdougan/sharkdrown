![sharkdrown](static/images/sharkdrown_banner.png)

# Overview 
SharkDrown is a Markdown Editor, extended with awks/sed like functions and mermaid graphs

## Current Features:
- Supports Standard and Github Markdown Formats
- Open/Save using Chrome Filesystem-API so can access local filesystem when run in container
- Multiple tab support
- Multiple views; code-view, rendered view, split-view.
- Edit support in preview mode; no need to switch to code view
- Split panel between code and preview/rendered view can be adjusted by dragging left/right
- Markdown syntax can be selected from menu bar
- Mermaid support
- Multiple colour themes, and font selection for rendered preview
- Transform panel, supporting multiple text manipulation options
  -- strip whitespace from start/end of line(s), or both; deduplicate or remove blank lines, collapse interal whitespace.
  -- remove prefix/suffix string from line(s) or globally
  -- split content into fields by specified delimitier, remove or retain selected fields and recombine with optional alternate delimiter
  -- find/replace strings
  -- display/remove control characters
