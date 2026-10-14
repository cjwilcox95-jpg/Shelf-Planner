# Changelog

Plain-English notes on what changed at each stage.

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
