# Markdown support

What the studio understands, how it differs from the specifications on purpose, and how this is measured.

## In short

- **CommonMark**, the reference specification of Markdown, is fully supported: headings, paragraphs, emphasis,
  lists, quotes, code, links, images, line breaks.
- **GitHub Flavored Markdown** (GFM) is supported too: tables, strikethrough, task lists, and automatic links
  for addresses written with their scheme (`https://…`), addresses starting with `www.` and e-mail addresses.
- **Footnotes**, which belong to neither specification, are placed at the foot of the page that calls them.
- The studio adds its own syntax for paged documents: size, alignment and caption of images and diagrams,
  `[[toc]]`, `\newpage`, Mermaid diagrams. See the [README](../README.md#usage).
- Four behaviours differ from CommonMark on purpose. They are listed below; nothing else differs.

## Differences made on purpose

| Behaviour                     | What you see                                                                                            | Why                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Raw HTML is not rendered      | `<div>` or `<br>` written in the Markdown shows as text                                                 | A document or a configuration file received from someone else cannot run code or alter the page      |
| Images are found by file name | `![Plan](img/plan.png)` shows the uploaded `plan.png`, or a "Missing image" box; remote images are kept | The studio has no file system: images are uploaded, and an existing Markdown file works as it is     |
| Typographic replacements      | `"quoted"` becomes “quoted” (« » in French), `--` becomes –, `...` becomes …, `(c)` becomes ©           | Print-quality text without typing special characters; the quotes follow the language of the document |
| Addresses become links        | `https://example.com` or `me@example.com` in the text is a link                                         | The behaviour people know from GitHub and chat tools                                                 |

Text inside code spans and code blocks is never changed.

## Measured conformance

The figures come from the examples published with the specifications: each one is a piece of Markdown and the
HTML it must produce.

<!-- conformance:start -->

CommonMark 0.31.2, 652 examples:

| Parser                                                               | Examples passed | Share   |
| -------------------------------------------------------------------- | --------------- | ------- |
| markdown-it alone, in CommonMark mode                                | 652 / 652       | 100.0 % |
| The studio, its additions set aside (heading anchors, image wrapper) | 533 / 652       | 81.7 %  |
| The studio, as it is                                                 | 493 / 652       | 75.6 %  |

Differences of the studio, by cause:

| Cause                                               | Examples |
| --------------------------------------------------- | -------- |
| Raw HTML is not rendered                            | 72       |
| Images are found by file name in the image library  | 22       |
| Typographic replacements (quotes, dashes, ellipsis) | 21       |
| Addresses written in the text become links          | 4        |

GitHub Flavored Markdown extensions:

| Extension           | Supported | Same HTML as the specification |
| ------------------- | --------- | ------------------------------ |
| Tables              | yes       | 6 / 8                          |
| Task list items     | yes       | 0 / 2                          |
| Strikethrough       | yes       | 1 / 2                          |
| Autolinks           | yes       | 9 / 11                         |
| Disallowed Raw HTML | yes       | 0 / 1                          |

<!-- conformance:end -->

How to read them:

- The parser is [markdown-it](https://github.com/markdown-it/markdown-it). Alone and in CommonMark mode it
  passes every example: the engine itself is conformant.
- "Its additions set aside" ignores what the studio adds to the HTML without changing what the Markdown means:
  the `id` of the headings and the wrapper around the images.
- Every remaining difference belongs to one of the four behaviours above. An example is attributed to a
  behaviour when strict CommonMark with that single option fails it the same way.
- For the GFM extensions the HTML of markdown-it differs from the one of the specification in details
  (alignment of a table column written as a style, `<s>` instead of `<del>`, slightly different rules for
  automatic links), so few examples are strictly identical although the syntax is understood.

## Not supported

| Syntax                    | Example                 | What you see today                         |
| ------------------------- | ----------------------- | ------------------------------------------ |
| Definition lists          | `Term` / `: Definition` | A paragraph                                |
| Subscript and superscript | `H~2~O`, `x^2^`         | The text as written                        |
| Math formulas             | `$a^2 + b^2$`           | The text as written                        |
| Highlighted text          | `==marked==`            | The text as written                        |
| Alerts                    | `> [!NOTE]`             | A quote starting with `[!NOTE]`            |
| Heading identifiers       | `# Title {#custom}`     | The braces in the title                    |
| Abbreviations             | `*[HTML]: Hyper Text`   | The text as written                        |
| Emoji shortcodes          | `:smile:`               | The text as written; type the emoji itself |

## Footnotes and task lists

```markdown
A claim[^source] and another one^[A note written in place.].

[^source]: The text of the note, anywhere in the document.

- [x] done
- [ ] to do
```

- A note is numbered in the order of the calls and printed at the foot of the page holding its call. A note
  called a second time shows the number of its first call. A call without a note stays as written.
- The text of a note is a single paragraph: the paragraphs of a longer note are joined.
- Check boxes are shown as they are written; they cannot be ticked in the preview.

## Running the measure

```bash
npm run conformance              # report in the terminal
npm run conformance -- --write   # also refresh the figures of this page, then npm run format
npm run test:unit                # fails if a difference has no known cause, or if the figures moved
```

The CommonMark examples come from the npm package [`commonmark-spec`](https://www.npmjs.com/package/commonmark-spec).
The examples of the GFM extensions are in `tests/fixtures/gfm-extensions.json`, extracted unchanged from the
[GitHub Flavored Markdown Spec](https://github.github.com/gfm/). Both are published under the
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) license and are only used for testing: they are
not part of the application.
