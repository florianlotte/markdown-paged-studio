# Personal defaults

Everything in this folder except this file and `config.example.json` is ignored by git. Use it to
pre-fill the studio with your own name, company logo, stylesheet and document template. These values
are read by Vite when the app starts or builds, apply on first launch and on **Reset**, and never
override a document already saved in your browser.

| File                                                                       | Purpose                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config.json`                                                              | Any document setting: `title`, `subtitle`, `author`, `headerTitle`, `headerName`, `footerText`, `language` (BCP 47 tag such as `en` or `fr`), `pageSize` (`A4`, `Letter`, `A5`), `marginTop`/`marginRight`/`marginBottom`/`marginLeft` (mm), `cover` (boolean). Copy `config.example.json` to start. |
| `logo.svg`, `logo.png`, `logo.jpg`, `logo.jpeg`, `logo.webp` or `logo.gif` | Cover page logo. One file only.                                                                                                                                                                                                                                                                      |
| `custom.css`                                                               | Default custom stylesheet, shown in the Design tab and restored by **Sample CSS**.                                                                                                                                                                                                                   |
| `template.md`                                                              | Default Markdown document.                                                                                                                                                                                                                                                                           |

Restart `npm run dev` after adding or removing a file so Vite picks it up; edits to an existing
file reload automatically. A production build (`npm run build`) bakes these defaults into `dist/`,
so only deploy such a build where sharing them is fine.
