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

### 2. Settings grouped by technique, not by intent — done

In **Design**, three numbering fields sit between "Header title" and "Header name". The document language is under **Page**. The image library sits under the logo, out of sight without scrolling.

Done: the three tabs hold groups by task, each one folding and remembered: Document (title, subtitle, author, date, language), Cover (switch, template, accent, logo) and Images (with the count of the library and of the missing names, "3 · 1 missing") under Content; Headers and footers, Numbering, Code and stylesheet under Design; Paper and Margins under Page.

### 3. Reset next to Export — done

A destructive action carried the same style as **Import…** in the primary action area, with a native `confirm()`.

Done: **Reset the document** lives in the "more" menu (⋯) of the toolbar, marked as destructive. It applies at once and a toast offers **Undo** for ten seconds, which brings the document, its settings and its images back.

### 4. Hidden power — done

Renaming a tab by double-click or F2, deleting with Delete, double-click in the preview to reach the source, Ctrl + wheel, Ctrl+Z over the preview, dropping or pasting images, Ctrl+Shift+1/2/3, double-click on the splitter: nothing announced them. The 28 tooltips relied on `title`, invisible on touch screens and from the keyboard.

Done: every file tab has a menu (right-click, long press, Shift+F10) with Rename, Move, Download and Remove and their shortcuts; the tooltips are the studio's own, shown on keyboard focus as well as on hover, with the shortcut of the control; the entries of the menus show their shortcut; a **Keyboard shortcuts** panel opens on `?`, from the ⋯ menu and from the Help menu of the desktop app; Ctrl+Shift+E and Ctrl+B work in the browser as on desktop. Still open: dropping or pasting images is only said in the hint of the image library.

### 5. One status line for everything — done

The small grey text "3 pages" (13 px, contrast 4.3:1) also showed "Rendering…", "PDF saved with its project" and "Render error". A transient success and an error should not live in a counter.

Done: the counter stays while a thin progress bar at the foot of the toolbar shows that the pages are being laid out again; the confirmations of the exports are a toast that goes away by itself; the errors are in the banner with their cause. The problems of the render (a diagram that does not parse, a formula KaTeX refuses, a missing image, an unknown reference) are counted next to the page count, and each entry of their list leads to the line in the editor.

### 6. Nothing says where the document lives — done

The autosave in the browser was silent. Whoever opens another browser or a private window lost the work without a warning.

Done: the row of the file tabs says "Saved in this browser · just now" (then minutes or hours ago) after each autosave, "Saving…" meanwhile, and "Not saved: the browser storage is full or disabled" in red when a save fails; its tooltip explains that the document lives in this browser only and points to **PDF with project**. The first visit opens the welcome tour, whose "Save and export" panel says the same and points to **PDF with project**.

### 7. Silent empty state — done

An empty document shows a white page with its header and an editor without a prompt.

Done: an empty file shows a prompt that names the **Insert** menu, which replaces the two buttons and writes an example of a table, an image (chosen files, added to the library and referenced), a diagram, a formula, an alert, a footnote, a page break or a table of contents at the cursor. A document without text shows a card over its pages that says what to do, with a button to the editor.

### 8. File tabs overflow without a signal — done

With six files the first tab was cut off on the left, with no shadow and no horizontal scroll on the wheel.

Done: a shadow on the side where tabs are hidden, the wheel scrolls the strip sideways, and a list button, shown only when tabs are hidden, offers every file with the current one checked.

### 9. Uneven forms — done

- Logo: a native file input ("Choose File" in the language of the browser, not translated, unsightly in the dark theme); **Remove logo** shown without a logo. Done: a drop zone (drop a file, or click to choose one), then a thumbnail with **Replace** and **Remove**.
- Date: free text, no picker, no **Today**. Done: a **Today** button and a date picker, both writing the date the way the document language writes it; the field stays free text.
- Language: the raw code (`en`) rather than the name. Done: a list of languages by name ("French (fr)"), and a tag field under "Other…" for any other BCP 47 tag.
- Margins: four fields without presets (Narrow, Normal, Wide) nor "same on all sides". Done: a preset select (Custom when the fields match none) and a "Same on all sides" box that makes the top field rule.
- Custom CSS: a plain textarea without colours or line numbers at the bottom of a scrolling panel, its **Import .css / Default CSS** buttons out of sight. Done: the buttons sit above the field, which is a CodeMirror editor with line numbers, CSS colours and its own undo history.
- Long checkbox labels ("Number figures and tables (Figure 1, Table 1)"): the example belongs in a hint under the field. Done, for that box and for the mirrored margins.

### 10. Contrast and focus — done

The focus ring of the fields was at 1.7:1 on white and 2.1:1 in the dark theme, under the 3:1 of WCAG 2.2; the focus colour itself at 2.8:1; the line numbers of the editor at 2.6:1. No `prefers-reduced-motion`.

Done: the focus colours are at 3:1 or more on every surface (4.3:1 to 5:1 in the light theme, 4.7:1 to 5.8:1 in the dark one), the line numbers at 3.6:1, the literals of the preview tools follow; under `prefers-reduced-motion` nothing sweeps or spins. The banner now lies over the top of the workbench, under the toolbar, and moves nothing.

### 11. Phones — done

The reading view works, but the toolbar takes three rows, a fifth of the screen, and the preview tools only exist on hover.

Done: under 760 px the toolbar is one row (sidebar toggle, page count, Edit | View, Export, ⋯ where Import… lives); the pages are fit in one column there, whatever the layout and zoom remembered for the desktop; a tap on a figure opens its tools and a second tap closes them, with a handle sized for a finger; the settings drawer is a modal dialog (focus inside, Escape closes, focus back on the toggle). Also done from the roadmap: a removed file comes back from its toast instead of asking a native confirmation.

### 12. Wording — done

The card "Pagination: computed by Paged.js" was jargon without an action: replaced by a hint under the margins, where the header and the footer need room. The Export button does not say that it produces a "PDF with project"; the zoom group mixes a stepper and the **Fit** toggle in one control: both left as they are for now.

## Plan

| Lot                | Content                                                                                                                                                                              | Effort      | State |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ----- |
| Quick fixes        | Responsive toolbar (1), Reset in a menu with Undo (3), stable page count and toasts (5), CSS buttons above the field (9), focus at 3:1 and reduced motion (10), Pagination card (12) | 1 to 2 days | done  |
| Discoverability    | Context menu of the file tabs, tooltips on focus with the shortcuts, Shortcuts panel, autosave indicator, overflow shadows (4, 6, 8)                                                 | 2 to 3 days | done  |
| Settings           | Grouping by intent, logo drop zone, date picker, margin presets, Insert menu (2, 7, 9)                                                                                               | 3 to 5 days | done  |
| Phones and preview | Reduced bar, tools on tap, banner without layout shift (10, 11)                                                                                                                      | 2 days      | done  |
| Writing comfort    | Outline of the headings with a filter, problems of the render with their line, CSS code editor, card of the empty document (5, 7, 9)                                                 | 1 to 2 days | done  |
