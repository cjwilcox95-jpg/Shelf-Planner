# Changelog

Plain-English notes on what changed at each stage.

## Real sizes from AFI's drawings (2026-10-16)

- AFI draws each reset to scale with planogram software. scripts/read_afi_sizes.py reads those drawings:
  real width and height for every product in the 3 reset PDFs (195 products), with depth worked out from AFI's
  shelf count (marked ≈ as an estimate). Every shelf's box count matched AFI's facings exactly.
- Products AFI stacks (49, e.g. Vlasic 24 oz jars 2 high, small olive cans 5 high) start stacked in a new plan from
  that reset.
- Which size is used: anything you entered (tape, then photo), then AFI's drawing, then AFI's depth estimate, then a guess.
  Edit size shows "AFI" where AFI's size is used; More shows which planogram it came from.
- Very thin or short tiles no longer show a number or mark that would not fit (zoom in to see them).
- Load the new catalog.json on the phone (Shelf > Load a newer store-data file) to get these sizes.

## Scanner and review pass (2026-10-16)

- Scan a barcode with the camera (or a photo, or typed digits) to find a product in the plan or add it.
- Measure as you go: scan, type the tape-measured size with fraction buttons, save, scan the next.
  Edit size also takes tape fractions like 2 3/4.
- Reviewed every screen at phone size against the brief's rules; a tour test now checks them on every run.
- Shelf headings are finger-sized (44 px). Position numbers no longer pile up on thin tiles; narrow tiles show the
  name up the side.
- Backup reminder when plans changed and were never backed up, or the last backup is over a week old.
- Search results say when a product is already in the plan. Compare offers "Copy this plan now".

## Stage 6: sales help (2026-10-15)

- Tools > Sales help: load a sales movement file (movement.json, or a CSV export with UPC and units columns).
  Only UPC and units sold are read; sales dollars, cost, margin and on-hand are ignored and never saved.
- "Worth a look" lists: may run out before the next delivery (pick 3, 7 or 14 days between deliveries), a full case
  won't fit, could give up a facing, slowest for the room they take, no sales, best sellers, not in the file.
- For a shelf that is over: which facings to give up first so it fits, keeping enough for the next delivery.
- The selected product shows "sells ~12/wk · shelf holds ~3 wk". Nothing ever changes a plan by itself.
- scripts/read_movement_scan.py reads the scanned BRData report with free OCR on this computer, checking every
  line against AFI's item numbers. Sales data is included in backups.

## Stage 5: print, compare, stacks and empty spaces (2026-10-15)

- Tools > Print or save as PDF: a drawing of the section to scale (portrait or landscape, whichever is bigger), each
  shelf's inches used and left, a numbered key of names beside each shelf, and a product list with check boxes.
  Save or share the PDF (Files, Print, Mail), or save page 1 as a picture. No prices are ever printed.
- Tools > Compare with another plan: what to add, take out, move to another shelf, slide along a shelf, facings or
  stacking changes, and shelf size changes. The change list can be added to the PDF for whoever sets the shelf.
- Stack a product 2 or more high (More > Stacked): the height check uses the whole stack and the shelf count includes
  every layer.
- Empty spaces (＋ Add > Add an empty space): a gap of any width that counts toward the shelf. Position numbers skip it.
- The bottom buttons are now ＋ Add, Plans, Shelf and Tools.
- The laundry plans now include the stacks and empty spaces from the photos.

## Laundry aisle from CJ's photos (2026-10-15)

- Four laundry sections (Tide; store brand/ERA/Gain; stain removers/boosters/Downy; starch/dye/bleach) recreated
  from three aisle photos as plans: 100 placements, 202 facings. Imported as one file under Plans.
- Widths (and most heights) measured from the photos, using each 4 ft section as a ruler, and labeled "from photo".
- Default guesses refined from those measurements: separate bleach jugs (narrower) and detergent jugs, plus pod bags,
  dye boxes, starch cans, trigger sprays and dryer-sheet boxes. Laundry rules now only apply to laundry categories
  (an earlier rule had caught snack packs and baking powder).
- Products not in the store files can now hold sizes too. "2 shelfs over" now reads "2 shelves over".

## Stage 4: real sizes (2026-10-15)

- Edit size: width, height and depth for any product, each labeled measured, from photo, or guess. Typing a number
  marks it measured. Saved for the product everywhere it appears, and included in backups.
- Marks: ~ = guess, ≈ = from a photo, no mark = measured. Tiles are dashed while any size is a guess.
- Notes per product, and a package-type override that changes its guesses.
- Measure from a photo: tap both ends of something you know (the shelf width, a dollar bill), then the product's
  edges. Checked with a test picture: 2.75 in and 17 in exactly.
- Default size guesses: an editable table of typical sizes by package type. New types from the aisle photos:
  jugs with handles (bleach, detergent), tubs (pods, powders), aerosol cans (starch), trigger sprays, dryer-sheet boxes.
- Size packs: one file of sizes by UPC, imported under Plans. A photo estimate never replaces a tape measurement.

## Photos, brought forward from Stage 5 (2026-10-15)

- Tiles show the product's photo on every facing when it has one; the shelf list shows a small thumbnail.
- Tap the "+ Photo" square on a selected product to take or pick a picture. White space around the product is
  trimmed and the picture is shrunk to about 400 px. Saved on the phone for that product in every plan.
- "Photo packs": one file with many photos (by UPC), imported under Plans. scripts/make_photo_pack.py makes one
  from a folder of pictures.
- Backups now include photos.
- First real check of the barcode math: the store website's full barcode for Food Club ketchup 20 oz matches the
  check digit the app calculates.

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
