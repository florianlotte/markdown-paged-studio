# Security policy

## Supported versions

Only the latest release receives fixes. The web app at
<https://florianlotte.github.io/markdown-paged-studio/> always runs the latest commit of `main` that passed the
tests.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Report it privately through
[GitHub private vulnerability reporting](https://github.com/florianlotte/markdown-paged-studio/security/advisories/new)
with:

- the version or commit (shown at the bottom of the sidebar) and where it runs: browser, desktop app, Docker
  image or MCP server;
- what an attacker can do, and the steps or the document that show it.

You should get an answer within a week. Once a fix is released, the advisory is published and credits you unless
you prefer otherwise.

## What the project protects

Knowing the design helps to judge whether a behaviour is a vulnerability.

- **No server, no account.** The studio runs in the browser. Documents, images and settings stay on the machine
  (localStorage and IndexedDB) and are never sent anywhere.
- **Untrusted documents.** Raw HTML in Markdown is not rendered. A configuration file is validated key by key on
  import; unknown keys and invalid values are dropped. Text placed in the page or in CSS strings is escaped.
  Mermaid runs with its strict security level.
- **Custom CSS is trusted input.** A stylesheet is applied as written to the document, and an exported HTML file
  carries it. Only load stylesheets and configuration files you trust: CSS can load remote resources such as
  fonts or images.
- **Desktop app.** The window is sandboxed, without Node.js access, and the page can only ask for a PDF export.
  Navigation away from the app is blocked and external links open in the system browser. The binaries are not
  code-signed: verify them with the `SHA256SUMS-*.txt` files of the release.
- **MCP server.** It reads image files and writes documents on behalf of an AI assistant. Set `MPS_OUTPUT_DIR`
  and `MPS_INPUT_DIR` to confine what it may write and read; existing files are only replaced with
  `overwrite: true`.

Out of scope: vulnerabilities of the browser or of Electron themselves, and problems that need a modified build
of the application.
