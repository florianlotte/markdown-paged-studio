# MCP server

`mcp/server.mjs` exposes Markdown Paged Studio to AI assistants through the
[Model Context Protocol](https://modelcontextprotocol.io) over stdio, so a local model can generate a
report and get a finished PDF back. It reuses the real rendering pipeline: the web build runs in a
headless Chromium (Playwright), including Mermaid diagrams, the language settings and your personal
defaults from `local/`.

## Setup

```bash
npm install
npx playwright install chromium --only-shell   # once
npm run build                                   # the server renders from dist/
npm run mcp                                     # starts the server on stdio (for a quick manual check)
```

Register it in your MCP client with `node <repo>/mcp/server.mjs` as the command. Examples:

Claude Code:

```bash
claude mcp add markdown-paged-studio -- node /absolute/path/to/markdown-paged-studio/mcp/server.mjs
```

Claude Desktop (`claude_desktop_config.json`) or any client using the same JSON shape:

```json
{
  "mcpServers": {
    "markdown-paged-studio": {
      "command": "node",
      "args": ["/absolute/path/to/markdown-paged-studio/mcp/server.mjs"]
    }
  }
}
```

Rebuild (`npm run build`) after changing the app or the files in `local/`: the server always renders the
current `dist/`.

## Tools

| Tool              | Input                                                                           | Result                                                                                    |
| ----------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `render_pdf`      | `markdown`, optional `config`, `output_path`, optional `overwrite` and `images` | Writes the PDF; returns `{ path, pages, bytes, missing_images }`                          |
| `render_html`     | `markdown`, optional `config`, optional `output_path`, `overwrite` and `images` | Standalone HTML, written to disk or returned inline                                       |
| `describe_config` | none                                                                            | Current defaults (including `local/`) and the accepted keys, page sizes and margin limits |

`config` accepts the same keys as `local/config.json`: `title`, `subtitle`, `author`, `date`,
`headerTitle`, `headerName`, `footerText`, `language`, `pageSize` (`A4`, `Letter`, `A5`), `marginTop`,
`marginRight`, `marginBottom`, `marginLeft` (mm), `cover`, `customCss`, `logoDataUrl`, `coverTemplate`
(`classic`, `centered`, `band`, `minimal`), `accentColor` (`#rrggbb`), `codeTheme` (`light`, `dark`,
`none`), `runningHeader` and `mirrorMargins` (booleans). Invalid values are ignored, like a JSON import
in the app.

Also in `markdown`: a line holding only `\newpage` starts a new page, a line holding only `[[toc]]` (or
`[[toc depth=2]]`) becomes the table of contents of the headings that follow it, a caption is the title
of an image (`![Alt](photo.png "Caption")`) or `caption="..."` on a mermaid fence line, code fences
with a language are syntax-highlighted, footnotes are written `Text[^1]` with `[^1]: the note` (or `^[in
place]`), and task lists `- [ ] to do`.

In `markdown`, a diagram is sized on its opening line: ` ```mermaid width=60% align=left ` (`width` from `10%` to `100%` or in `mm`; `align` is `left`, `center` or `right`).

`images` lists the local image files of the document: `[{ "path": "/data/charts/q3.png" }]`, with an optional `name` when the Markdown uses another file name. The document matches them **by file name only**, so `![Chart](charts/q3.png)` and `![Chart](q3.png)` both use that file; size and place them with `![Chart](q3.png){width=60% align=right}`: alone on its line an image is centered unless `align` says `left` or `right`, inside a sentence `left` and `right` float it with the text around and `center` gives it a line of its own. Supported types: png, jpg, webp, gif, svg, up to 20 MB each. `missing_images` in the result names the images the Markdown references but that were not provided.

The resource `studio://css-contract` documents the HTML structure and class names a `customCss`
stylesheet can target.

## Example exchange

> Write the monthly infrastructure report from these notes and export it as PDF.

The assistant calls `describe_config` to learn the defaults, drafts the Markdown (with a `mermaid`
diagram if useful), then calls `render_pdf` with `{ title, author, date, language: "fr" }` and an
`output_path`. The reply carries the path and the page count.

## Safety

- An existing file is never replaced unless the call passes `overwrite: true`.
- Set `MPS_INPUT_DIR=/some/folder` to confine the image files the tools may read to that folder; only image files are ever read.
- Set `MPS_OUTPUT_DIR=/some/folder` in the server's environment to confine every write to that folder; relative `output_path` values are then resolved inside it. Without it, any path the server process can write to is accepted.

## Notes

- Each call renders in a fresh browser context; the browser itself is launched once and closed when
  the server exits.
- A render is capped at 60 seconds.
- Test: `npm run test:mcp` (after `npm run build`).
