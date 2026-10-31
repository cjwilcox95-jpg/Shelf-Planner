# Changelog

Plain-English notes on what changed at each stage.

## Thousands of photos (2026-10-31)

- Photos are now saved as picture files with a small copy (about 128 px) for the drawing and lists. The app reads
  only the photos it is showing, so it opens fast and stays light with thousands of photos (measured with about
  16,000: opening went from about 3.5 s to under 1 s, memory from about 250 MB to about 15 MB).
- Photo files load in batches with progress ("Loading photos… 400 of 960"), and say clearly if the phone runs out of
  space. A photo you took yourself is never replaced by a picture from a photo file.
- Backups carry the photos you took, not the store pictures (those come from the photo files), so backups stay small.
- The Backup tab shows how many photos are on the phone and how much space the app uses.
- Photos saved by the older version move over by themselves the first time the new version opens.
- Search shows results faster; search results have small pictures.
- The photo-file maker splits big sets into files of 2,000 photos.

## Second review pass (2026-10-31)

- **Offline copy**: always saves the newest files after an update (it could keep yesterday's page and then open blank
  offline), and updates phones when only an icon changes.
- **Wide sets** (16–20 ft) no longer jump back to the left end at every shelf change; a product moved with ▲ ▼ stays in
  view; dragging near the edge of the drawing scrolls it.
- **Scanner**: the camera stays on between scans (no restart after every product), says "camera busy" vs "camera
  blocked in Settings" correctly, and has a "Try the camera again" button. Scanning a product that is off the shelf says
  so and opens that list (instead of offering to add a second copy).
- **Undo on a message** now confirms with "Undone"; messages also show over the Off the shelf list.
- Wording made consistent ("Off the shelf"; "Work on Shelf 7"); screen readers hear which product a facings button is
  for; the open plan keeps its ids when a backup is loaded; backups keep shelf sizes above 120 in.
- Store-data builder: "2 DR PEPPER" is not read as 2 freezer doors; any two sets with the same name are told apart;
  photo files named with 11 digits go to the product that really exists.
- Cleanup: the old list, 49 unused style rules and duplicate code removed. README describes the new main screen.
- New tests: Undo from a message, the ends of a shelf, the whole set fitting a phone screen, aisles keeping ▲ ▼ in one
  section, scanning a product that is off the shelf.

## Code review fixes (2026-10-30)

A full read-through of the app and the data scripts, in four parts. No path for cost, retail or margin was found.
Fixed:

- **Copied plans** no longer share hidden product ids with the original (in one aisle, changing one changed both).
  Plans saved by older versions are repaired when the app opens or a backup is loaded.
- **Imports**: a damaged backup, store-data file or guess table is cleaned instead of crashing the app; class names
  are kept as plain text only.
- **Works with no signal**: the app is now saved for offline use the first time it is opened (before, the page itself
  was never saved), opens the saved copy after 3.5 s on a weak signal, and old copies are cleared after updates.
- **Scanner**: the camera turns off if the barcode reader can't load (with the right message), pauses when you switch
  apps, and is off while you type a measurement. "Save, scan next" can't save twice and reports a failed save.
- **Main screen**: dragging a product up while zoomed in no longer counts as a swipe; wide aisles scroll sideways to
  the shelf you are on; while moving a product the "tap a shelf" bar sits at the top so ▲ ▼ still work; your own
  scrolling is no longer reset by unrelated updates.
- **Smaller**: size Save waits for the save; the guess table can't silently undo an edit; delete asks inside the app
  (some phones block the browser's pop-ups); a blank sales cell is not "0 sold"; "2 inch" is understood; Gain Flings
  are guessed as a pod bag; PDF titles with brackets are always valid.
- **Store data builder**: Frozen Fruit is now read as a 2-door freezer set (its top shelves get measured heights); the
  two waffle sets have different names; sets with no width or 0 facings are reported instead of stopping the build;
  every dropped row is listed in the match report; photo packs named with 11 digits go to the right product.

## New main screen: the whole set, or one shelf at a time (2026-10-30)

Built for one hand, standing in the aisle (CJ picked mockup D).

- The app opens on the **whole set**, shrunk to fit the screen, with product pictures. Each shelf's name and room left
  are written on its board.
- **Tap a shelf or a product** to zoom in to that shelf. The drawing becomes a window onto it (with a peek of the
  shelves above and below), and its products are listed underneath, left to right.
- Every row has **facings − / +** right on it. Tap a row for **Left, Right, Up, Down, Take off and Details**. Up and
  down keep it in the same section and the screen follows it there. Press-and-hold dragging still works.
- At the bottom: **▲ / ▼** to step between shelves (or swipe the drawing), and a **live mini picture of the whole set**
  in between. Tap it to zoom back out.
- Bottom bar: **Plans · Undo · Scan · Add · Tools**. Redo and Shelf sizes moved into Tools; a shelf's Size button is
  next to its name when you are zoomed in.
- The big status card became a small tag at the top ("Everything fits", "1 shelf over"); tap it for the details.
- "Off the shelf" opens as its own list with a "Put on Shelf N" button for the shelf you are on.
- All tests updated for the new screen; the screen rules (text 14 px+, buttons 44 px+, nothing wider than the screen)
  pass on phone and desktop.

## Visual overhaul (2026-10-16)

- New look throughout: calm colors, rounded cards, lighter buttons, icons (lucide, free), a cleaner shelf drawing.
- Top bar: "‹ Plans" to get back to your plans, the plan name on one line, undo and redo.
- A one-line status ("Everything fits", "Width fits", "2 shelves over") with problems as small tags, instead of the big
  colored box.
- Bottom tabs: Add, Scan (now one tap), Shelf, Tools. Tools is a grid of tiles.
- Plans is split into tabs: Your plans (aisles, sections, new), AFI sets (grouped Shelves / Freezer, with search) and
  Backup.
- A product with no size on file no longer shows a stray dot at the start of its list line.
- Nothing about how plans work changed; all tests pass, including the screen rules (text 14 px+, buttons 44 px+).

## All 32 AFI sets (2026-10-16)

- Loaded every AFI set CJ has: 32 sets (8 grocery, 22 freezer, charcoal, and a 2026 laundry recommendation), 1,191
  products on shelves. The reader now handles freezer doors ("Shelf 1/3" = door 1, shelf 3), widths like 2 ft 6 in,
  AFI's older 2022 report, a few lines where AFI swapped the UPC and item number, and the 2026 Fabric Care
  recommendation (shelf 1 = top there; no AFI item numbers, so matched by UPC).
- Real sizes from AFI's drawings for 1,065 products (31 of 32 sets; the 2026 list has no measurable drawing). Products
  drawn as pictures are measured too, and "caps" (units laid flat on top) are not mistaken for stacks.
- The room above each shelf is measured from the drawing too (a gondola's top shelf stays open at 12 in).
- A freezer set with several doors opens as an aisle, one 30 in section per door. The set list has a search box.
- Frozen products are not in the store's item files yet (AFITMGRC and the HBC book have no frozen), so freezer sets
  show their products as "not in store files" until AFI's frozen item file is added.

## Aisles: sections side by side (2026-10-16)

- Plans > Aisles > Make an aisle from plans: tap the sections left to right and name it. Opening the aisle shows every
  section side by side, shelf 1 of each along the bottom, with an upright between sections.
- Drag (or tap, Move, tap) a product from one section to another. Each change is saved into the section plans
  themselves, so every section still opens on its own.
- Anything past the end of its section's shelf is drawn in red, hanging into the next section.
- Shelf names say which section they are in ("B · Shelf 3"), with the letters explained above the drawing.
- Print makes each section's pages in turn. Shelf sizes "for every shelf" apply to that one section; adding or removing
  shelves and Compare are done on a single section.
- Aisles are included in backups. The laundry file now includes the "Laundry aisle" (A, B, C, D).

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
