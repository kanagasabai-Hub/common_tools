# Browser Tools

A small collection of single-page browser tools, published with GitHub Pages. The site
root is a dashboard that lists every tool; each tool lives in its own folder and is a
static HTML page with no build step. Design tools share local CSS and JavaScript assets;
all pages can be opened from disk or served with any static web server.

**Live site:** https://kanagasabai-hub.github.io/<your-repo>/
*(update this link once the repository exists)*

## Adding a new tool

1. Create `tools/<your-tool>/index.html` — a static page, with local assets if needed.
2. Add one entry to `tools.js`:

   ```js
   {
     id: 'your-tool',
     name: 'Your Tool',
     description: 'One or two sentences about what it does.',
     href: 'tools/your-tool/index.html',
     icon: '📐',
     tags: ['print', 'csv'],
     status: 'live',          // live | beta | planned
     updated: '2026-09-07'
   }
   ```

   Write `href` as a path to the **file**, not the folder. A folder URL like
   `tools/your-tool/` only resolves to `index.html` on a web server; opened from disk it
   shows a directory listing. (The dashboard repairs folder-style links when it detects
   `file://`, but the explicit form is clearer.)

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
  color-picker & gradient/
    index.html                      color and gradient editor
    color-studio.js                  color math, palettes, gradients and exports
  pattern-generator/
    index.html                      pattern library and editor
    patterns.js                     130 vector recipes and exports
  design-studio.css                 shared responsive design-tool styles
  studio-common.js                  shared local utilities
tests/
  studio-smoke.html                 browser integration and export checks
```

---

# Design tools

Open either tool from the dashboard. Both are dependency-free and work offline, including
when opened from disk. Keep their folders and the shared `tools/design-studio.css` and
`tools/studio-common.js` files together.

## Color & Gradient Studio

**Page:** [`tools/color-picker & gradient/index.html`](tools/color-picker%20%26%20gradient/index.html)

- Color picker with a saturation/brightness canvas, HSV sliders, editable RGB/HSL
  channels, native color well, HEX entry and opacity.
- Copy HEX, HEX8, RGB, HSL, HSV, approximate CMYK, OKLCH and CSS variables.
- Screen eyedropper where the browser supports it; local image pixel sampling and
  dominant-color extraction (images up to 20 MB).
- Seven palette harmonies, palette CSS export and palette-to-gradient conversion.
- WCAG 2.x contrast ratios and AA/AAA checks, including alpha compositing against an
  editable background. CMYK is unprofiled and is not a print color proof.
- Linear, radial, conic and mesh/glow gradients; 2–12 color stops/layers, per-stop
  opacity, draggable and keyboard-adjustable stops, angles, center positioning,
  radial shapes, repeats, mesh layer centers, reversal and even distribution.
- Twelve presets, randomization, sample text, fullscreen preview and undo/redo.
- CSS, PNG, SVG and editable JSON projects. Non-repeating linear/radial gradients
  export as vector SVG; conic, mesh and repeating gradients embed a rendered PNG in
  the SVG. Mesh is a stack of radial glows, not a Bézier mesh editor.

## Pattern Studio

**Page:** [`tools/pattern-generator/index.html`](tools/pattern-generator/index.html)

130 recipes cover floral, geometric, textile, organic, decorative, retro and tech families,
plus custom motifs. Category chips are derived from the recipe table, so a new family appears
in the sidebar on its own.
The library includes dots, stripes, grids, checks, honeycomb, cubes, chevrons, rings,
gingham, plaid, tartan, herringbone, basket weave, houndstooth, argyle, knit, waves,
terrazzo, confetti, grain, pebbles, wood grain, contour lines, stars, flowers, ornamental
tiles, mazes, Truchet arcs and more. This is an extensible collection rather than a claim
to exhaust every possible pattern; some traditional textures are stylized interpretations.

- Search and category filters, eight color schemes, three editable colors, swapping,
  inversion, transparency and opacity.
- Scale, rotation, weight, density, motif spacing, mirroring and X/Y offsets.
  Controls that do not apply to the selected recipe are disabled.
- Seeded organic and randomized patterns; matching settings and seed reproduce the
  same geometry. Custom shapes or short text support grid, half-drop and scatter layouts.
- Preview zoom, tile-boundary guides, stationery mockup, fullscreen and undo/redo.
- Vector SVG backgrounds, seamless unrotated base tiles, PNG, standalone CSS data URIs
  and JSON project import/export. Preview decorations are excluded from exports.
  Text motifs use the rendering system's fonts and can vary between devices.

Both tools support exports from 16 to 4096 pixels on either axis, up to 30 saved
creations per tool in browser local storage, and an 80-state undo history. Saved
creations are specific to the browser and origin; export JSON projects for portable
backups. If browser storage is blocked or full, the tools still work and explain how
to export a project. Nothing is uploaded, and no external assets or libraries load.

## Checking the design tools

```bash
python -m http.server 8765 --bind 127.0.0.1
```

Open `http://127.0.0.1:8765/tests/studio-smoke.html` in a current Chromium browser.
The browser test page checks conversion/contrast math, editing and undo/redo, imports,
every pattern's SVG rendering, deterministic seeds, downloads and PNG pixels, mobile
overflow, and dashboard routes. Downloads are intercepted by the tests. Test saves
are restored afterward so existing saved creations remain intact.

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
