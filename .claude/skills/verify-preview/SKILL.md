---
name: verify-preview
description: Launch the Vite dev server, open Markdown Paged Studio in Chrome, and confirm the Paged.js preview renders with no console errors. Use after any change to src/main.js, src/ui.css, or index.html, since the project has no automated tests.
---

Verify a change in the real browser. Paged.js only runs in a browser, so this replaces a test run.

1. Load the Chrome tools if they are not loaded yet, in one ToolSearch call:
   `select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__find,mcp__claude-in-chrome__read_console_messages,mcp__claude-in-chrome__tabs_close_mcp`
2. Run `npm run lint` and `npm test` first. Fix failures before opening the browser.
3. Start the dev server in the background: `npm run dev -- --strictPort --port 5173`. If the port is busy, pick another with `--port` and use that URL below.
4. Call `tabs_context_mcp`, then `tabs_create_mcp`, then navigate the new tab to `http://localhost:5173/`.
5. Wait for the render. The toolbar `#status` span shows `Rendering…` while Paged.js works, then `N page(s)` on success or `Render error` on failure. Poll with `find` for the status text; give it up to 10 seconds.
6. Check `read_console_messages` with `pattern: "error|Error|paged"`. Any uncaught error or Paged.js error is a failure.
7. Take a screenshot with `computer` and look at it: the cover page must appear first when the cover checkbox is on, the header and footer margin boxes must show the configured text, and the page counter must read `Page X / Y`.
8. If the change touched `documentCss()`, `standaloneHtml()`, or `.cover-page`, also switch the page size to A5 and Letter via the `Page` tab and re-check the render, because the cover height is hard-coded to A4.
9. Do not click `Print / PDF`: it calls `window.print()`, which opens a blocking dialog that stalls the browser session. Check the export path by reading the generated HTML string instead.
10. Close the tab with `tabs_close_mcp` and stop the dev server.

Report: page count, console errors (or none), and what the screenshot showed. If anything failed, quote the console error text in a code block.
