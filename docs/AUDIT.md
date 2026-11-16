# Fine-tooth-comb review (November 2026)

CJ asked for the whole project to be taken apart and checked, so that it works, anyone can pick it up and use
it, and the screens are more refined. This is the list of what was found, in plain words, and what was done.

How it was checked: every file of the app, the offline worker, the data-prep scripts and the tests was read;
every screen was photographed at phone and desktop size; the automatic tests were run.

Status key: **Fixed** = changed and tested. **Kept** = looked at, fine as it is. **Open** = not done, with the reason.

## 1. Things that could stop it working

| # | What was found | Status |
|---|---|---|
| 1.1 | If any screen hits an unexpected error, the whole app goes blank with no way back. | **Fixed.** A plain "Something went wrong" screen says the plans are safe, opens the app again, and can save a backup file made straight from storage. |
| 1.2 | After an update is published, a phone that already has the app open keeps the old screens but the old barcode reader file is gone, so scanning can fail until the app is closed and reopened. Nothing tells the person. | **Fixed.** A green notice says a newer version is ready, with a "Use it now" button. |
| 1.3 | If the browser refuses to save data (private browsing, storage blocked), the first screen just says a file could not be loaded. It does not say why. | **Fixed.** The first screen says the browser is not letting the app save, and to use a normal window. |
| 1.4 | With a keyboard (a computer, or a phone with a keyboard), a shelf cannot be opened from the whole-set picture. This slipped in with the last change, which removed the "Work on Shelf" button. | **Fixed.** Each shelf label in the whole-set picture is a real button (Tab, then Enter). Panels take the keyboard focus and hand it back. |
| 1.5 | If a product disappears while it is being dragged (for example Undo on a second finger), the drawing could crash. | **Fixed.** The drag is dropped quietly instead. |
| 1.6 | A store-data file with a set that has no width would crash when a plan is started from it. A backup with a plan that has no name shows a blank title. | **Fixed.** A set with no width is treated as 4 ft; a plan with no name is called "Plan". Plans saved on the phone are checked at start and a damaged one is repaired (the original is kept aside). |
| 1.7 | Search misses a product when the name is typed with an apostrophe or other punctuation ("french's" does not find FRENCHS). | **Fixed.** Punctuation is ignored and a possessive is optional. |
| 1.8 | Facings and stacking accept a broken number from a damaged file. | **Fixed.** A broken number counts as 1. |
| 1.9 | Before the app's code has loaded (slow signal) the page is plain white with no word on it. | **Fixed.** The page says "Opening Shelf Planner…", and says so if JavaScript is off. |

| 1.10 | A product from an AFI set whose barcode could not be read (it has a name but no UPC) was dropped when a backup was loaded. | **Fixed.** A product with a name is always kept, in backups and in repairs. |
| 1.11 | A change made a split second before the app is closed might not be saved, because saving started a moment after the screen updated. | **Fixed.** Saving now starts in the same step as the screen update. (Found because one test, run under heavy load, lost a change.) |

## 2. Things a first-time user would trip over

| # | What was found | Status |
|---|---|---|
| 2.1 | The first screen needs a `catalog.json` file. Someone without one can do nothing, not even look around. | **Fixed.** "Try it with demo products": made-up products that come with the app (invented brands; barcodes in the range kept for a shop's own codes). |
| 2.2 | Nothing explains how the app works: what a facing is, that tapping a shelf opens it, that a product can be dragged by pressing and holding it. | **Fixed.** A five-step Welcome the first time, and "How it works" under Tools with what the words mean. |
| 2.3 | Words only CJ knows: "AFI set", "catalog.json", "KEHE special order", "clearance", "section", "aisle". | **Fixed** where it could be: the words are explained in How it works, and the first screen and Backup say "your store's product file". "AFI set" is kept because it is what the store calls them. |
| 2.4 | The tag at the top says "Width fits" when some products are too tall or too deep. That reads like good news. | **Fixed.** It now says "2 to check" in amber; the panel says "Fits side to side" and lists what is too tall or too deep. |
| 2.5 | An empty shelf says "Tap Add" but offers no button there. | **Fixed.** "Add a product" and "Scan one" buttons on the empty shelf. |
| 2.6 | A scanned product that is not in the store's list is added as "UPC 0-12345-..." and can never be given a name. | **Fixed.** Details has "Give it a name" for such a product. |
| 2.7 | Names in a few places are still in capitals (scan result, compare list, sales help). | **Fixed.** |
| 2.8 | A new person cannot get their own products in unless someone runs the data-prep scripts. | **Fixed.** A product list saved as CSV (with UPC and Description columns) can be loaded on the first screen or under Plans > Backup. Only UPC, name, size, case pack and category are read; cost and price columns are never read. It asks before replacing a real product list. |

## 3. Look and polish

| # | What was found | Status |
|---|---|---|
| 3.1 | The six buttons on an opened product row are cramped; "Take off" wraps onto two lines on a phone. | **Fixed.** Four arrows, then two wider buttons; on the smallest phones the two wordier buttons go on a second line. |
| 3.2 | On the whole-set screen the grey hint strip sits oddly between the white picture and the bottom bar. | **Fixed.** The picture is a rounded card like the one-shelf view, with the hint under it. |
| 3.3 | The loading screen and the first screen are plain next to the rest. | **Fixed.** |
| 3.4 | When a panel opens, the keyboard focus stays behind it; screen readers are not told it is a pop-up. | **Fixed.** |
| 3.5 | Small inconsistencies in spacing, button sizes and wording between panels. | **Fixed** where found: the whole plan name shows (two lines), the shelf-size button is labelled "Size", product rows no longer repeat the facings, messages wrap instead of being cut off, names on the shelves are in normal case, the whole-set picture has no half-written names. A phone held sideways is asked to turn upright (that layout is too short to use). |

## 4. Looked at and kept

- Fit maths, size guesses, UPC rules, tape-measure reading, plan changes and undo: read line by line, covered by
  unit tests (231 in all after this review), no faults found.
- Saving on the phone: every change is saved at once; photos are saved in batches; a full phone is reported.
- Backups: importing only adds and updates, never deletes; the newer copy of a plan wins.
- Cost, retail and margin: never read by the app; files coming in are trimmed to the known fields.
- Offline: every file the app needs is saved on first open; pages update when there is a signal.
- Data-prep scripts (Python): 36 tests, 26 pass and 10 are skipped because they need the store's own files.

## 5. Cannot be checked here

- A real iPhone or Android phone (camera, Add to Home Screen, the share sheet). Tested in a simulated phone only.
- The older browser tests (`app/e2e/app.spec.js`) and the data-prep run need the store's files, which were lost
  from the build machine on 2026-11-14 and have to be uploaded again.

## 6. How it is tested now

- 231 unit tests of the maths and the file handling.
- 27 browser tests of the everyday actions (`app/e2e/demo.spec.js`), run at phone and desktop size on the made-up
  demo products, so they run on any computer.
- A tour of every screen (`app/e2e/tour.spec.js`) at three sizes (small phone 320 px, phone 390 px, desktop), which
  fails if any text is under 14 px, any button is under 44 px tall, or anything runs off the screen.
