# Shelf Planner

A free, phone-first web app for planning shelf sets (planograms) at Firelake Express Grocery, McLoud OK.

Pick a shelf (standard: 48 in wide x 24 in deep), put products on it, and see **to scale, in real inches**:

- whether everything fits, and how many inches are left or over
- whether any product is too deep for the shelf, and how many fit front to back
- what the set looks like

## Ground rules

- **Free.** No paid services, no API keys, no logins.
- **Your data stays on your device.** Plans are saved in the browser on your phone. Use Plans > Backup > Export backup / Import to move them or keep a copy.
- **No cost data, ever.** Case cost, unit cost, retail and margin are stripped during data prep. The app never ships, stores or shows them.
- **Photos stay private.** Photos you take, or pictures from firelakefoods.com saved with the store's permission (for this store's planning only). They live on the phone, never in this public GitHub project. Backups carry the photos you took; store pictures are loaded from the photo files again on a new phone.
- **Honest dimensions.** Every size is labeled *measured*, *estimated from photo* or *guessed*. Guessed sizes are drawn with a dashed outline and a `~` (marks show when you zoom in to a shelf).

## Status

**Stages 1-4 and 6 done; Stage 5 done except cutting the background out of photos.**

Open it: **https://cjwilcox95-jpg.github.io/Shelf-Planner/** (the first time, load your `catalog.json` file). See [CHANGELOG.md](CHANGELOG.md).

| Stage | What it adds | Status |
|---|---|---|
| 0 | Read the data files, set up the project | Done (AFI category master still to come) |
| 1 | Clean product catalog (no cost data), UPC match report | Done (AFI resets: 3 of 35 PDFs so far) |
| 2 | One shelf drawn to scale, finger drag, capacity bar, search, Ketchup-Mustard demo | Done |
| 3 | Whole section (stacked shelves, drag between them), plans (save/copy/rename/delete), undo/redo, "off the shelf" tray, backup file, start from a whole AFI reset | Done |
| 4 | Product detail panel, editable dimensions, default-guess table | Done: sizes with sources, notes, guess table, measure-from-photo tool, size packs |
| 5 | Photos (camera, background removal), print/export | Done except background removal: photos on tiles, Add photo, photo packs, print / PDF / picture, stacking and empty spaces, compare plans |
| 6 | Movement-based suggestions (asked for 2026-10-15) | Done: Tools > Sales help, units sold only |

(Stages 3 and 4 were swapped on 2026-10-15 so whole sections came first.)

## Project layout

```
data/raw/      Original spreadsheets and PDFs go here. NEVER committed to git (they contain cost data).
docs/          Notes, including DATA_NOTES.md (what each data file is and its problems).
scripts/       Data-prep tools (Python):
                 build_catalog.py       makes data/build/catalog.json and match_report.md
                 read_price_book_pdf.py reads an AFI price book PDF, keeping only safe fields
                 upc.py                 turns every UPC format into one 12-digit key
                 make_photo_pack.py     folder of pictures named by UPC -> photo pack file(s) for the app (2,000 photos each)
                 read_movement_scan.py  scanned BRData movement report -> movement.json (UPC + units sold only)
                 read_afi_sizes.py      real product sizes from the to-scale drawing in each AFI reset PDF
tests/         Automatic checks for data prep. Run: python3 -m unittest discover -s tests
app/           The web app (React + Vite).
                 src/lib/        fit math, dimension guesses, search, undo, on-device storage (with unit tests)
                 src/components/ the shelf drawing and panels
                 e2e/            browser tests at phone and desktop size, with finger dragging
data/build/    The finished catalog and report. NEVER committed (store data); copied to your phone instead.
```

## Where your store's data lives

This GitHub project is **public** (free hosting requires it), so it holds **no store data**:
no item list, no costs, no prices. The cleaned catalog (`catalog.json`: UPC, description, pack,
size, category, aisle) is built on this workspace and loaded onto your phone, where it stays.

To rebuild the catalog after getting new files: put them in `data/raw/`, then run
`python3 -I scripts/build_catalog.py` and `python3 -m unittest discover -s tests`.

## Using the main screen

- The app opens on the **whole set**, fitted to the screen, with each shelf's name and room left on its board.
- **Tap a shelf or a product** to zoom in to that shelf. Its products are listed underneath, left to right, with
  **facings − / +** on every row. Tap a row for **Left, Right, Up, Down, Take off** and **Details** (photo, size,
  stacking, Move).
- At the bottom: **▲ / ▼** step between shelves (or swipe the drawing), and the **mini picture** of the whole set
  zooms back out. Bottom bar: **Plans · Undo · Scan · Add · Tools** (Redo and Shelf sizes are in Tools).
- The tag at the top says whether everything fits; tap it for details and the **Off the shelf** list.

## Tools in the app

- **Scan a barcode** (the Scan button in the middle of the bottom bar, also in Add and Tools): point the phone camera at a product's barcode to see where it is in the
  plan or add it. A photo of the barcode or the typed digits work too. Reads UPC-A, UPC-E (small packages) and
  EAN-13, on the phone, with the free zxing-wasm library bundled in the app (nothing is sent anywhere).
- **Measure as you go** (Tools): scan, type the tape-measured width, height and depth (whole inches plus a
  fraction button: 1/8 ... 7/8), save as *measured*, scan the next product.
- **Print or save as PDF**: a drawing of the section to scale with a numbered key, and a product list with check
  boxes. Optionally a change list compared with another plan. Save to Files, print, or save page 1 as a picture.
- **Compare with another plan**: what to add, take out, move (to another shelf or along the same one), facings
  and stacking changes, and shelf size changes, going from one plan (e.g. "current") to the open one ("proposed").
- **Sales help (worth a look)**: from a sales movement file (`movement.json` or a CSV export). Lists what may run
  out before the next delivery, where a full case will not fit, facings that could be given up, the slowest sellers
  per foot of shelf, best sellers, no sales, and for a shelf that is over, which facings to give up first.
  **Units sold only**: sales dollars, cost, margin and on-hand are ignored and never saved. Nothing changes a plan.
- **Shelf sizes**: width, depth and room above each shelf; add or remove a shelf (also the Size button next to a
  shelf's name when zoomed in).
- **Redo**: brings back what Undo took away.
- **Default size guesses**: the typical size per package type that every guess starts from.
- **Aisles** (under Plans): several sections side by side. Move products from one section to the next and see what hangs
  over into the neighbour. Changes are saved into each section's own plan.

Tap a product's row, then **Details**, then **More** for *Stacked* (stack 2 or more high). **＋ Add** can add an
**empty space** (a gap of any width that counts toward the shelf).

## Sales movement data

Movement (units sold) is store data, so like the catalog it is never put in this public project. To make the app's file
from the scanned BRData report: install the free OCR tool once (`python3 -m venv ocrenv && ocrenv/bin/pip install
rapidocr-onnxruntime`), then run `ocrenv/bin/python -I scripts/read_movement_scan.py data/raw/<scan>.pdf`. It writes
`data/build/movement.json` and `movement_report.md` (what was read and which lines to check). Every line is checked
against AFI's item number; units out of the report's highest-first order are flagged.

## Backups and restoring a fresh workspace

The Claude workspace is temporary. Three kinds of things live in three places:

| What | Where it is kept |
|---|---|
| App code, scripts, tests, notes | This GitHub project |
| Original files (contain cost data) and built store data (catalog, photos, photo tool) | Two zip files CJ keeps privately, never on GitHub: `shelf-planner-SOURCE-FILES-CONFIDENTIAL-<date>.zip` and `shelf-planner-work-files-<date>.zip` (each has a RESTORE.txt) |
| Plans and photos made on the phone | In the app: Plans > Backup > Export backup > Save to Files |

To restore: clone this project, upload both zips, put the source files in `data/raw/` and unpack the work files into
`data/build/`, then run `python3 -I scripts/build_catalog.py` and the tests.

## Working on the app

```
cd app
npm install
npm test            # fit math and other unit tests
npm run build
npx playwright test # browser tests (needs data/build/catalog.json)
```

Publishing: the built `app/dist` folder is pushed to the `gh-pages` branch, which GitHub Pages serves.

## Known limits

- Sizes start as guesses (dashed outline and ~), except products in an AFI reset PDF: those use AFI's planogram
  width and height (drawn to scale in 2022-24; a package may have changed since) and a depth estimate (≈) worked
  out from AFI's shelf count. Correct any size under Edit size (tape = measured, or ≈ from a photo).
- Photos are drawn inside the product's size box, so a photo can look short or narrow while its size is still a guess.
- Measuring from a photo is about ±10% (camera distortion); a tape measure is better.
- Stacks and empty spaces are modeled. A product hanging across two sections is not (the plan notes say where).
- No background removal yet: store-site pictures have white backgrounds (trimmed automatically); aisle photos keep their background.
- Store-site pictures: 960 for the AFI sets so far, and a whole-store download running in daily sessions (CJ approves
  each session). They are kept off GitHub and delivered to CJ as zips and app photo files.
- **Back up regularly** (Plans > Backup > Export backup). Plans live only in the phone's browser.
  On iPhone, Safari can clear a website's saved data if it isn't opened for a few weeks;
  adding the app to the Home Screen (Share, then Add to Home Screen) protects against that.
  Open the app in Safari or from the Home Screen icon, not inside another app's built-in browser.
- Dragging was tested with simulated touch in Chrome. CJ has used it on an iPhone; report anything odd.
- Importing a backup merges plans (newer copy wins); it never deletes plans on the phone.
- Printed PDFs are pictures of the pages (no selectable text). Text in narrow tiles is cut short; the key beside each
  shelf and the product list give full names.
- Sales help uses units sold only (no sales dollars or margin, by design). "Shelf holds X days" depends on product
  depths, which are mostly still guesses. A sales file made "for selected UPCs" leaves products out; missing is not
  the same as not selling. The BRData scan is read by OCR: check `movement_report.md` for lines that were left out or flagged.
- Comparing plans matches products by UPC and shelves by number (1 = bottom).
- The scanner was tested with a simulated camera showing a real, slightly blurry barcode, and with photos; not yet on
  CJ's iPhone. Some store shelf tags print AFI's own code instead of the product UPC; scan the product itself.
  Foreign EAN-13 barcodes (not starting with 0) cannot match the store's 12-digit UPCs.
- In the whole set, position numbers and size marks are hidden; tap a shelf to see them and its full list.
- Clearance defaults to 12 in on every shelf; set each shelf's real clearance with the Size button next to the shelf's
  name (zoomed in), or Tools > Shelf sizes.
- No vendor names: neither AFI file has a vendor column.
- Product names are AFI's 30-character abbreviations (e.g. "HNZ KETCHUP JUG").
- Only about 380 items have an aisle (from the store order list).
- AFI resets: all 32 sets CJ has are loaded. Freezer products are not in the store files yet (no frozen item file), so
  they show as "not in store files". The 2026 Fabric Care list has no AFI item numbers and no measurable drawing.
- No source file prints full 12-digit barcodes, so check digits are calculated. AFI reset matches are confirmed by AFI item number instead.
