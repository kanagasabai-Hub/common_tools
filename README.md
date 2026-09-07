# Browser Tools

A small collection of single-page browser tools, published with GitHub Pages. The site
root is a dashboard that lists every tool; each tool lives in its own folder and is a
self-contained HTML file with no build step.

**Live site:** https://kanagasabai-hub.github.io/<your-repo>/
*(update this link once the repository exists)*

## Adding a new tool

1. Create `tools/<your-tool>/index.html` — a single self-contained page.
2. Add one entry to `tools.js`:

   ```js
   {
     id: 'your-tool',
     name: 'Your Tool',
     description: 'One or two sentences about what it does.',
     href: 'tools/your-tool/',
     icon: '📐',
     tags: ['print', 'csv'],
     status: 'live',          // live | beta | planned
     updated: '2026-09-07'
   }
   ```

3. Commit and push. The dashboard rebuilds itself from that list — search, tag filters and
   the tool count all update automatically. Entries with `status: 'planned'` (or
   `href: null`) render as a dimmed "In progress" card that isn't clickable, so you can
   advertise what's coming.

`tools.js` is a plain script rather than JSON on purpose: it loads over `file://` too, so
the dashboard works when you just double-click `index.html` locally.

## Repository layout

```
index.html                          dashboard — lists every tool
tools.js                            the tool registry (edit this to add a tool)
404.html                            friendly not-found page, links back to the dashboard
formatter.html                      redirect kept from before the restructure
.nojekyll                           serve files as-is, no Jekyll
tools/
  employee-cards/
    index.html                      the card generator
    sample-employee-codes.csv       synthetic sample data — not real people
```

---

# Tool: Employee Code & Seating Cards

Turn a list of employee codes and names into print-ready A4 sheets of bordered cards —
seating stickers, label sheets, name badges or large guest tiles — and export them as
**PDF, PNG, SVG** or send them straight to the printer.

## Privacy

Everything runs in your browser. The file you upload is read with the browser's local
`FileReader`, and the PDF/PNG/SVG are generated on your machine. **No employee data is
uploaded anywhere** — there is no server, no analytics and no storage. The only network
request the page makes is loading the jsPDF library from a CDN.

## What it does

- **Input** — upload `.csv` / `.txt` / `.tsv`, or paste directly. One record per line as
  `code, name`. A `Employee Code,Name` header row is detected and skipped.
- **Card content** — code with the name below, code only, or name only. Names can be
  first-name-only or full, optionally uppercased.
- **Any card size** — width and height in millimetres, with presets:

  | Preset | Size | Per A4 page |
  |---|---|---|
  | Label sheet | 63 × 38 mm | 21 (3 × 7) |
  | Seating sticker | 180 × 80 mm | 3 |
  | Slim seating | 180 × 60 mm | 4 |
  | Name badge | 90 × 50 mm | 10 |
  | Square code card | 45 × 45 mm | 20 |
  | Guest tile (landscape) | 250 × 150 mm | 1 |
  | VIP full tile (landscape) | 270 × 190 mm | 1 |
  | Table tent (landscape) | 130 × 95 mm | 4 |

- **Page setup** — A4 portrait or landscape, per-edge margins (top / bottom / sides),
  separate column and row gaps, centre or top-left alignment, optional cut guides.
  Cards are packed at exactly the gap you specify; a hint appears when one more row or
  column is within 12 mm of fitting.
- **Borders** — single line, double line, or none, with adjustable thickness.
- **Colours** — a 16-swatch palette, three colour wells (fill / text / border) with hex
  entry, and ready-made schemes. Picking a fill auto-selects readable text.
- **Typography** — font family, weight and italic, plus sliders for code size, name size
  and the space between them. 100% means "as large as the card allows"; the sliders scale
  down from that, so text can never spill past the border.
- **Page numbers** — bold and centred at the foot of each sheet, in four formats.
- **Exports** — vector PDF at exact A4, 300 DPI PNG per page, SVG per page, a cleaned CSV
  of what was laid out, and browser Print with a matching `@page` size.

## Printing

Choose **100% / "Actual size"** in the print dialog — not "Fit to page" — or the
millimetre dimensions will come out short. The PDF export is exact-size vector and is the
most reliable route to a printer.

## Publishing to GitHub Pages

Everything is static, so no build step and no workflow file are required.

```bash
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

Then in the repository: **Settings → Pages → Build and deployment → Source: Deploy from a
branch**, branch `main`, folder `/ (root)`. The dashboard appears at
`https://<your-user>.github.io/<your-repo>/` and each tool at
`https://<your-user>.github.io/<your-repo>/tools/<name>/`.

Note that GitHub Pages needs a **public** repository on a free account.

## Dependencies

[jsPDF 2.5.1](https://github.com/parallax/jsPDF) from cdnjs, used only for the PDF export.
If it fails to load (offline, or a blocked CDN) the PDF button says so and Print →
"Save as PDF" produces the same result with no dependency at all.

## Browser support

Any current Chrome, Edge, Firefox or Safari. The preview uses millimetre CSS units and the
exports use Canvas and Blob downloads.
