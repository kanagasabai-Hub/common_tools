# Employee Code & Seating Card Generator

Turn a list of employee codes and names into print-ready A4 sheets of bordered cards —
seating stickers, label sheets, name badges or large guest tiles — and export them as
**PDF, PNG, SVG** or send them straight to the printer.

**Live app:** https://kanagasabai-hub.github.io/employee-card-generator/
*(update this link to match your repository name)*

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

The whole app is one static file, so no build step is required.

```bash
git init
git add .
git commit -m "Employee card generator"
git branch -M main
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

Then in the repository: **Settings → Pages → Build and deployment → Source: Deploy from a
branch**, branch `main`, folder `/ (root)`. The site appears at
`https://<your-user>.github.io/<your-repo>/` within a minute or two.

`.nojekyll` is included so GitHub serves the files as-is instead of running them through
Jekyll.

## Repository contents

| File | Purpose |
|---|---|
| `index.html` | The entire application — HTML, CSS and JS in one file |
| `formatter.html` | Redirect to `index.html` (the app's former filename) |
| `sample-employee-codes.csv` | Synthetic sample data for testing — not real people |
| `.nojekyll` | Tells GitHub Pages to skip Jekyll processing |

## Dependencies

[jsPDF 2.5.1](https://github.com/parallax/jsPDF) from cdnjs, used only for the PDF export.
If it fails to load (offline, or a blocked CDN) the PDF button says so and Print →
"Save as PDF" produces the same result with no dependency at all.

## Browser support

Any current Chrome, Edge, Firefox or Safari. The preview uses millimetre CSS units and the
exports use Canvas and Blob downloads.
