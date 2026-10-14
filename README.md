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
- **No scraped photos.** Only photos you take or upload yourself.
- **Honest dimensions.** Every size is labeled *measured*, *estimated from photo* or *guessed*. Guessed sizes are drawn with a dashed outline and a `~`.

## Status

**Stage 1: data prep done.** There is no app to open yet; Stage 2 adds it. See [CHANGELOG.md](CHANGELOG.md).

| Stage | What it adds | Status |
|---|---|---|
| 0 | Read the data files, set up the project | Done (AFI category master still to come) |
| 1 | Clean product catalog (no cost data), UPC match report | Done, except the AFI master part |
| 2 | One shelf drawn to scale, finger drag, capacity bar, search, Ketchup-Mustard demo | Not started |
| 3 | Product detail panel, editable dimensions, default-guess table | Not started |
| 4 | Several shelves, save/load/duplicate plans, undo/redo, backup, start from an AFI reset | Not started |
| 5 | Photos (camera, background removal), print/export | Not started |
| 6 | Movement-based suggestions (only when asked) | Not started |

## Project layout

```
data/raw/      Original spreadsheets and PDFs go here. NEVER committed to git (they contain cost data).
docs/          Notes, including DATA_NOTES.md (what each data file is and its problems).
scripts/       Data-prep tools (Python):
                 build_catalog.py       makes data/build/catalog.json and match_report.md
                 read_price_book_pdf.py reads an AFI price book PDF, keeping only safe fields
                 upc.py                 turns every UPC format into one 12-digit key
tests/         Automatic checks. Run: python3 -m unittest discover -s tests
data/build/    The finished catalog and report. NEVER committed (store data); copied to your phone instead.
```

## Where your store's data lives

This GitHub project is **public** (free hosting requires it), so it holds **no store data**:
no item list, no costs, no prices. The cleaned catalog (`catalog.json`: UPC, description, pack,
size, category, aisle) is built on this workspace and loaded onto your phone, where it stays.

To rebuild the catalog after getting new files: put them in `data/raw/`, then run
`python3 -I scripts/build_catalog.py` and `python3 -m unittest discover -s tests`.

(More folders will be added as stages are built.)

## Known limits

- No app to open yet.
- No vendor names: neither AFI file has a vendor column.
- Product names are AFI's 30-character abbreviations (e.g. "HNZ KETCHUP JUG").
- Only about 380 items have an aisle (from the store order list).
- Still waiting on AFI_category_master.xlsx, PlanogramPOC.jsx and the Ketchup-Mustard PDF.
- No source file prints full 12-digit barcodes yet, so UPC check digits are calculated, not verified.
