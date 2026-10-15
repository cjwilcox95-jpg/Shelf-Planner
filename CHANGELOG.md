# Changelog

Plain-English notes on what changed at each stage.

## Stage 3: whole sections, plans and backup (2026-10-15)

- The screen now shows a whole section: every shelf stacked top to bottom, all at one scale.
  Each shelf shows inches used and inches left (or OVER) on one line.
- Drag products between shelves with your finger, or tap, Move, then tap any shelf.
- "Take off" moves a product to an "Off the shelf" tray instead of deleting it, so you can see what was cut
  and put it back. AFI's left-off items start there too.
- Plans: save several, open, copy (keep "current" and "proposed"), rename, delete.
- Start a new plan from a whole AFI reset (every shelf, AFI's facings) or an empty section.
- Shelf size per shelf, or for every shelf at once. Add or remove shelves.
- Export backup: one file with all plans and the store data (Save to Files). Import merges it back
  without deleting anything, so it also moves everything to a new phone.
- The summary says "Everything fits" only when width, height and depth all fit.
- The one shelf saved by Stage 2 becomes a plan automatically.

## Fix (2026-10-15)

- The app now works at its real address, https://cjwilcox95-jpg.github.io/Shelf-Planner/ (GitHub addresses are case-sensitive; the app was built for lowercase).

## Stage 2: one shelf on your phone (2026-10-14)

- New web app. The first time, you load your store-data file (catalog.json); it stays on your phone.
- A shelf drawn to scale in real inches: products stand on a shelf board, with a ruler and the clearance line.
- Inches used, inches left, or "4.5 in OVER" in red. Nothing is ever blocked.
- Flags products deeper than the shelf or taller than the clearance, and shows about how many fit front to back.
- Move products with your finger (press and hold, then slide), or tap a product, tap Move, then tap the spot.
- Facings + and -, remove, undo and redo. The shelf is saved on the phone after every change.
- Search all 23,755 products by words or UPC (a scanned barcode, the AFI short form, or part of one).
- Start from any shelf of the AFI Ketchup-Mustard, Pickles-Relish or Glass Peppers-Olives resets.
- Every size is a labeled guess based on package type and size (for example a 20 oz squeeze bottle is about 2.75 in wide).
- Works offline after the first visit. Can be added to the Home Screen.
- Data prep now reads AFI reset PDFs: 89% of the reset items are in the store's files, confirmed by AFI item number.

## Stage 1: data prep (2026-10-14)

- Built one product catalog from the AFI grocery item file and the HBC price book: 23,755 products
  (15,204 regular, 8,551 KEHE special order). Only UPC, description, pack, size, category, subclass and
  aisle are kept. No cost, retail or margin.
- Every UPC is turned into the same 12-digit form, with the barcode check digit calculated.
- Pallets, shippers and displays are labeled; 72 placeholder rows (sticker rolls, pallets with no real UPC) are left out.
- Aisles added for about 380 items from the store order list.
- A match report lists duplicates, items left out, order-list items not found, and sizes cut off in the source.
- Automatic tests check the UPC math and that the catalog contains no cost-like fields or numbers.

## Stage 0: project set up (2026-10-14)

- Created the project folder, git history, README and this changelog.
- Set git to ignore the raw spreadsheets and PDFs so cost data can never be committed by accident.
- Read the grocery item file, HBC price book, order list and the scanned movement report. Notes in docs/DATA_NOTES.md.
- Added a reader for AFI price book PDFs that keeps only safe fields (no cost or retail).
- Still to do: read the AFI category master, the old prototype and the Ketchup-Mustard PDF.
