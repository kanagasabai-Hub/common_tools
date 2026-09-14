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
  paint-mixer/
    index.html                      paint recipes and animated mixing bowl
    paint-model.js                  unit conversions and approximate RYB mixing
    paint-scene.js                  dependency-free WebGL / Canvas renderer
    paint-library.js                60 original color mixing references
    paint-mixer.js                  editor, batch scaling and recipe exports
    paint-mixer.css                 paint studio layout and print stylesheet
  design-studio.css                 shared responsive design-tool styles
  studio-common.js                  shared local utilities
tests/
  studio-smoke.html                 browser integration and export checks
  paint-model.test.cjs              paint arithmetic and validation checks
  paint-browser.html                paint editor, 3D and export integration checks
```

---

# Design tools

Open the design tools from the dashboard. All are dependency-free and work offline, including
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

## Paint Mixing Studio

**Page:** [`tools/paint-mixer/index.html`](tools/paint-mixer/index.html)

- Animated WebGL mixing bowl with a lit paint surface, colored droplets, swirling
  ribbons, orbit/zoom controls, pause/replay, a blend-position slider, and eight speeds
  from 0.5× through 64×. Five motions (circular, figure-eight, palette-knife fold,
  fast agitation, incremental addition) have distinct previews and procedure notes;
  they converge to the same estimated pigment color, not different chemical results.
  A Canvas 2D preview is used when WebGL is unavailable. Reduced-motion preferences
  start with a still, completed mix; animation can be started explicitly.
- Add, name, recolor and remove up to **500 ingredients**. An 18-color paint box and
  60 searchable recipes across ten color families provide generic references, not
  measured brand pigments. Each card shows its predicted swatch and paint proportions.
  Loading a reference replaces the paint ingredients while retaining medium/liquid settings.
- Mix ml, liters, calibrated drops, US teaspoons/tablespoons and US fluid ounces in
  one volume recipe. Switching units preserves volume. Percentage mode uses a target
  batch volume, checks the total, and offers normalization to 100%.
- Rescale batches without changing proportions. Per-ingredient relative tint
  strength changes estimated color influence without changing material quantities.
- Track up to 100 separate liquid additions: water, waterborne reducer, solvent,
  acrylic liquid/glazing/pouring/gel mediums, oil medium, prepared flow improver,
  retarder, or a custom liquid. Choose volume/drop units or **percent of paint volume**.
  The product-system and medium-family checks flag mismatches or unverified compatibility;
  no generic preset supplies a manufacturer-approved dilution ratio.
- Paint percentages describe the paint batch before liquids. Final volume is the
  nominal sum of paint and additions; rescaling in volume mode targets that final volume.
  For example, 100 ml paint plus a 25%-of-paint addition produces 125 ml, not 100 ml.
- Customize the base body, individual paint body and each liquid body on a relative
  0–100 index. The illustrative blend uses a volume-weighted geometric mean of
  `1 + body`, minus one. Thinner liquids lower the index; a higher-body medium can
  raise it. This is **not measured rheology, cP, dry-film thickness or equipment calibration**.
  Simulated motion uses the estimated mixture body. Clear liquids leave pigment-only
  HEX unchanged while reducing the coat opacity by the paint-volume concentration.
- JSON, CSV and TXT preserve liquid quantities, individual body inputs, procedure,
  concentration, final volume and compatibility notes. SVG/PNG/PDF recipe sheets
  include added liquids and a mixture summary. Earlier JSON recipes import with no
  liquids and the circular motion as defaults.
- Eleven medium presets: acrylic, watercolor, gouache, oil, alkyd, enamel, latex,
  spray/automotive, airbrush, artist ink and tempera. Presets alter simulated flow,
  gloss and visual coat coverage; they do not prescribe compatible products,
  reducer/hardener ratios, drying shifts or calibrated pigment scattering.
- Artist RYB approximation (including yellow + blue tending toward green), or an
  RGB-average reference. **Neither is a spectral or manufacturer-calibrated paint
  match.** Real pigment/binder combinations require physical test swatches.
- Ingredient proportions, HEX/RGB/HSL estimates, a surface/coat preview, notes,
  undo/redo, and up to 40 locally saved recipes.
- Export **CSV, JSON, TXT, SVG recipe cards, PNG recipe cards, 3D PNG snapshots,
  and Print / Save as PDF**. JSON imports restore editable recipes. Draft recipes
  can be saved as JSON; finished recipe exports require positive quantities and,
  in percentage mode, a 100% total. CSV guards spreadsheet formula-like text.
- Very tall recipe cards (over 12,000 pixels or 16 million pixels total) use SVG,
  CSV, JSON or PDF instead of PNG. All ingredient quantities are retained in those
  formats. SVG/PNG cards shorten long names and direct you to the data exports for
  full names and per-color tint strengths.

Everything stays local. No dependencies, backend, credentials or uploads are needed.
Reference links in the liquid panel point to GOLDEN's product information on
[flow and pigment load](https://goldenartistcolors.com/resources/airbrush-tips-vol2)
and [mediums and viscosity](https://goldenartistcolors.com/resources/open-acrylic-colors).
Product-specific instructions take precedence over these illustrative controls.
Drop volume must be calibrated to the actual dropper and paint. Physical conversions
are volume-based; grams are deliberately excluded because paint density is unknown.

## Checking the design tools

The paint tool has additional checks: run `node tests/paint-model.test.cjs` and open
`http://127.0.0.1:8765/tests/paint-browser.html`. Add `?webgl` to require the 3D renderer
in that browser test; otherwise a functioning Canvas fallback is accepted. The tests
intercept downloads and restore saved recipes after testing.

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
