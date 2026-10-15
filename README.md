# Shelf Planner

A free, phone-first web app for planning shelf sets (planograms) at Firelake Express Grocery, McLoud OK.

Pick a shelf (standard: 48 in wide x 24 in deep), put products on it, and see **to scale, in real inches**:

- whether everything fits, and how many inches are left or over
- whether any product is too deep for the shelf, and how many fit front to back
- what the set looks like

## Ground rules

- **Free.** No paid services, no API keys, no logins.
- **Your data stays on your device.** Plans are saved in the browser on your phone. Use Export backup / Import backup to move them or keep a copy.
- **No cost data, ever.** Case cost, unit cost, retail and margin are stripped during data prep. The app never ships, stores or shows them.
- **Photos stay private.** Photos you take, or pictures from firelakefoods.com saved with the store's permission (for this store's planning only). They live on the phone and in backups, never in this public GitHub project.
- **Honest dimensions.** Every size is labeled *measured*, *estimated from photo* or *guessed*. Guessed sizes are drawn with a dashed outline and a `~`.

## Status

**Stage 4: real sizes.** (Stages 1-3 done; photos started.)

Open it: **https://cjwilcox95-jpg.github.io/Shelf-Planner/** (the first time, load your `catalog.json` file). See [CHANGELOG.md](CHANGELOG.md).

| Stage | What it adds | Status |
|---|---|---|
| 0 | Read the data files, set up the project | Done (AFI category master still to come) |
| 1 | Clean product catalog (no cost data), UPC match report | Done (AFI resets: 3 of 35 PDFs so far) |
| 2 | One shelf drawn to scale, finger drag, capacity bar, search, Ketchup-Mustard demo | Done |
| 3 | Whole section (stacked shelves, drag between them), plans (save/copy/rename/delete), undo/redo, "off the shelf" tray, backup file, start from a whole AFI reset | Done |
| 4 | Product detail panel, editable dimensions, default-guess table | Done: sizes with sources, notes, guess table, measure-from-photo tool, size packs |
| 5 | Photos (camera, background removal), print/export | Started: photos on tiles, Add photo, photo packs, photos in backups |
| 6 | Movement-based suggestions (only when asked) | Not started |

(Stages 3 and 4 were swapped on 2026-10-15 so whole sections came first.)

## Project layout

```
data/raw/      Original spreadsheets and PDFs go here. NEVER committed to git (they contain cost data).
docs/          Notes, including DATA_NOTES.md (what each data file is and its problems).
scripts/       Data-prep tools (Python):
                 build_catalog.py       makes data/build/catalog.json and match_report.md
                 read_price_book_pdf.py reads an AFI price book PDF, keeping only safe fields
                 upc.py                 turns every UPC format into one 12-digit key
                 make_photo_pack.py     folder of pictures named by UPC -> one photo pack file for the app
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

## Backups and restoring a fresh workspace

The Claude workspace is temporary. Three kinds of things live in three places:

| What | Where it is kept |
|---|---|
| App code, scripts, tests, notes | This GitHub project |
| Original files (contain cost data) and built store data (catalog, photos, photo tool) | Two zip files CJ keeps privately, never on GitHub: `shelf-planner-SOURCE-FILES-CONFIDENTIAL-<date>.zip` and `shelf-planner-work-files-<date>.zip` (each has a RESTORE.txt) |
| Plans and photos made on the phone | In the app: Plans > Export backup > Save to Files |

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

- Sizes start as guesses (dashed outline and ~). Correct them under Edit size (tape = measured, or ≈ from a photo).
- Photos are drawn inside the product's size box, so a photo can look short or narrow while its size is still a guess.
- Measuring from a photo is about ±10% (camera distortion); a tape measure is better.
- No background removal yet: store-site pictures have white backgrounds (trimmed automatically); aisle photos keep their background.
- Store-site pictures: only 1 test picture so far. The automatic download for the Ketchup-Mustard set needs CJ to approve it
  (Claude Code's safety check blocks it in auto mode).
- **Back up regularly** (Plans, then Export backup). Plans live only in the phone's browser.
  On iPhone, Safari can clear a website's saved data if it isn't opened for a few weeks;
  adding the app to the Home Screen (Share, then Add to Home Screen) protects against that.
  Open the app in Safari or from the Home Screen icon, not inside another app's built-in browser.
- Dragging was tested with simulated touch in Chrome. CJ has used it on an iPhone; report anything odd.
- On very crowded shelves the position numbers overlap when zoomed out; zoom in to read them.
- Importing a backup merges plans (newer copy wins); it never deletes plans on the phone.
- Clearance defaults to 12 in on every shelf; set each shelf's real clearance under "Shelf size".
- No vendor names: neither AFI file has a vendor column.
- Product names are AFI's 30-character abbreviations (e.g. "HNZ KETCHUP JUG").
- Only about 380 items have an aisle (from the store order list).
- AFI resets: 3 of the 35 reset PDFs are loaded (Ketchup-Mustard, Pickles-Relish, Glass Peppers-Olives).
- No source file prints full 12-digit barcodes, so check digits are calculated. AFI reset matches are confirmed by AFI item number instead.
