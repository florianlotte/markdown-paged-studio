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

| Tool              | Input                                                 | Result                                                                                    |
| ----------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `render_pdf`      | `markdown`, optional `config`, `output_path`          | Writes the PDF; returns `{ path, pages, bytes }`                                          |
| `render_html`     | `markdown`, optional `config`, optional `output_path` | Standalone HTML, written to disk or returned inline                                       |
| `describe_config` | none                                                  | Current defaults (including `local/`) and the accepted keys, page sizes and margin limits |

`config` accepts the same keys as `local/config.json`: `title`, `subtitle`, `author`, `date`,
`headerTitle`, `headerName`, `footerText`, `language`, `pageSize` (`A4`, `Letter`, `A5`), `marginTop`,
`marginRight`, `marginBottom`, `marginLeft` (mm), `cover`, `customCss`, `logoDataUrl`. Invalid values
are ignored, like a JSON import in the app.

The resource `studio://css-contract` documents the HTML structure and class names a `customCss`
stylesheet can target.

## Example exchange

> Write the monthly infrastructure report from these notes and export it as PDF.

The assistant calls `describe_config` to learn the defaults, drafts the Markdown (with a `mermaid`
diagram if useful), then calls `render_pdf` with `{ title, author, date, language: "fr" }` and an
`output_path`. The reply carries the path and the page count.

## Notes

- Each call renders in a fresh browser context; the browser itself is launched once and closed when
  the server exits.
- A render is capped at 60 seconds.
- Test: `npm run test:mcp` (after `npm run build`).
