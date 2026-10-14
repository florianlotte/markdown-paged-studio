# UX review

A review of the studio from the point of view of a UX designer, made on version 1.24.0 (October 2026) in ten window widths from 390 to 1440 px, both themes, both languages and about twenty states (menus, banner, export lock, empty document, missing image, preview tools, keyboard focus), with the contrast of every colour token measured. The findings are ordered by priority; each one says what was observed, what is proposed, and whether it is done. The open items are the UX backlog of the project.

## What works

- **The concept reads in ten seconds.** Three zones (settings, source, pages), a sample document that doubles as a tutorial, a preview that is faithful to print.
- **The accessibility groundwork is serious.** ARIA roles on the tabs, the menus and the splitter; keyboard navigation of the file tabs and the menus; preview tools reachable with the keyboard; a complete dark theme through tokens; a non-blocking banner; an explicit lock during exports.
- **The wording is careful**, and the French interface is complete, desktop menu included.

## Findings, by priority

### 1. Toolbar cut off between 761 and 1000 px — done

Under 1100 px the toolbar wrapped onto two, then three rows, and under 1000 px the Export button left the window (right edge at 967 px in a 900 px window). The action group stacked its buttons vertically and the bar never wrapped.

Done: under 1100 px the view controls take a row of their own under the title and the actions; the actions never stack. Export and the menus stay in reach at every width.

### 2. Settings grouped by technique, not by intent — open

In **Design**, three numbering fields sit between "Header title" and "Header name". The document language is under **Page**. The image library sits under the logo, out of sight without scrolling.

Proposed: group by task. Document (title, author, date, language), Cover (switch, template, accent, logo), Headers and footers, Numbering, Page setup (size, margins, mirror), Style (code theme, CSS), Images. Four tabs, or three tabs with collapsible sections and a counter ("Images: 3, 1 missing").

### 3. Reset next to Export — done

A destructive action carried the same style as **Import…** in the primary action area, with a native `confirm()`.

Done: **Reset the document** lives in the "more" menu (⋯) of the toolbar, marked as destructive. It applies at once and a toast offers **Undo** for ten seconds, which brings the document, its settings and its images back.

### 4. Hidden power — open

Renaming a tab by double-click or F2, deleting with Delete, double-click in the preview to reach the source, Ctrl + wheel, Ctrl+Z over the preview, dropping or pasting images, Ctrl+Shift+1/2/3, double-click on the splitter: nothing announces them. The 28 tooltips rely on `title`, invisible on touch screens and from the keyboard.

Proposed: a context menu on the file tabs (Rename, Delete, Download), home-made tooltips shown on focus too and carrying the shortcut ("Export · Ctrl+Shift+E"), a **Keyboard shortcuts** panel on `?`.

### 5. One status line for everything — done

The small grey text "3 pages" (13 px, contrast 4.3:1) also showed "Rendering…", "PDF saved with its project" and "Render error". A transient success and an error should not live in a counter.

Done: the counter stays while a thin progress bar at the foot of the toolbar shows that the pages are being laid out again; the confirmations of the exports are a toast that goes away by itself; the errors are in the banner with their cause. Still open: a link from a render error to the faulty line.

### 6. Nothing says where the document lives — open

The autosave in the browser is silent. Whoever opens another browser or a private window loses the work without a warning.

Proposed: "Saved in this browser · 2 s ago" near the file tabs, and a note on the first visit that points to **PDF with project**.

### 7. Silent empty state — open

An empty document shows a white page with its header and an editor without a prompt.

Proposed: a placeholder in the editor, and an **Insert** menu in place of "Page break / Table of contents" (table, figure, formula, diagram, alert, footnote, page break, table of contents).

### 8. File tabs overflow without a signal — open

With six files the first tab is cut off on the left, with no shadow and no horizontal scroll on the wheel.

Proposed: overflow shadows, horizontal scroll on the wheel, a drop-down list of the files.

### 9. Uneven forms — partly done

- Logo: a native file input ("Choose File" in the language of the browser, not translated, unsightly in the dark theme); **Remove logo** shown without a logo. Proposed: a drop zone with a thumbnail, and **Replace / Remove** only when a logo exists.
- Date: free text, no picker, no **Today**.
- Language: the raw code (`en`) rather than the name.
- Margins: four fields without presets (Narrow, Normal, Wide) nor "same on all sides".
- Custom CSS: a plain textarea without colours or line numbers at the bottom of a scrolling panel, its **Import .css / Default CSS** buttons out of sight. Done: the buttons sit above the field. Proposed: a CodeMirror CSS editor.
- Long checkbox labels ("Number figures and tables (Figure 1, Table 1)"): the example belongs in a hint under the field.

### 10. Contrast and focus — done

The focus ring of the fields was at 1.7:1 on white and 2.1:1 in the dark theme, under the 3:1 of WCAG 2.2; the focus colour itself at 2.8:1; the line numbers of the editor at 2.6:1. No `prefers-reduced-motion`.

Done: the focus colours are at 3:1 or more on every surface (4.3:1 to 5:1 in the light theme, 4.7:1 to 5.8:1 in the dark one), the line numbers at 3.6:1, the literals of the preview tools follow; under `prefers-reduced-motion` nothing sweeps or spins. Still open: the banner shifts the whole layout when it appears.

### 11. Phones — open

The reading view works, but the toolbar takes three rows, a fifth of the screen, and the preview tools only exist on hover.

Proposed: a reduced bar (mode, Export, ⋯) and tools opened by a tap on a figure.

### 12. Wording — done

The card "Pagination: computed by Paged.js" was jargon without an action: replaced by a hint under the margins, where the header and the footer need room. The Export button does not say that it produces a "PDF with project"; the zoom group mixes a stepper and the **Fit** toggle in one control: both left as they are for now.

## Plan

| Lot                | Content                                                                                                                                                                              | Effort      | State |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ----- |
| Quick fixes        | Responsive toolbar (1), Reset in a menu with Undo (3), stable page count and toasts (5), CSS buttons above the field (9), focus at 3:1 and reduced motion (10), Pagination card (12) | 1 to 2 days | done  |
| Discoverability    | Context menu of the file tabs, tooltips on focus with the shortcuts, Shortcuts panel, autosave indicator, overflow shadows (4, 6, 8)                                                 | 2 to 3 days | open  |
| Settings           | Grouping by intent, logo drop zone, date picker, margin presets, Insert menu (2, 7, 9)                                                                                               | 3 to 5 days | open  |
| Phones and preview | Reduced bar, tools on tap, banner without layout shift (10, 11)                                                                                                                      | 2 days      | open  |
