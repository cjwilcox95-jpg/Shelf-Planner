# Fine-tooth-comb review (November 2026)

CJ asked for the whole project to be taken apart and checked, so that it works, anyone can pick it up and use
it, and the screens are more refined. This is the list of what was found, in plain words, and what was done.

How it was checked: every file of the app, the offline worker, the data-prep scripts and the tests was read;
every screen was photographed at phone and desktop size; the automatic tests were run.

Status key: **Fixed** = changed and tested. **Kept** = looked at, fine as it is. **Open** = not done, with the reason.

## 1. Things that could stop it working

| # | What was found | Status |
|---|---|---|
| 1.1 | If any screen hits an unexpected error, the whole app goes blank with no way back. | |
| 1.2 | After an update is published, a phone that already has the app open keeps the old screens but the old barcode reader file is gone, so scanning can fail until the app is closed and reopened. Nothing tells the person. | |
| 1.3 | If the browser refuses to save data (private browsing, storage blocked), the first screen just says a file could not be loaded. It does not say why. | |
| 1.4 | With a keyboard (a computer, or a phone with a keyboard), a shelf cannot be opened from the whole-set picture. This slipped in with the last change, which removed the "Work on Shelf" button. | |
| 1.5 | If a product disappears while it is being dragged (for example Undo on a second finger), the drawing could crash. | |
| 1.6 | A store-data file with a set that has no width would crash when a plan is started from it. A backup with a plan that has no name shows a blank title. | |
| 1.7 | Search misses a product when the name is typed with an apostrophe or other punctuation ("french's" does not find FRENCHS). | |
| 1.8 | Facings and stacking accept a broken number from a damaged file. | |
| 1.9 | Before the app's code has loaded (slow signal) the page is plain white with no word on it. | |

## 2. Things a first-time user would trip over

| # | What was found | Status |
|---|---|---|
| 2.1 | The first screen needs a `catalog.json` file. Someone without one can do nothing, not even look around. | |
| 2.2 | Nothing explains how the app works: what a facing is, that tapping a shelf opens it, that a product can be dragged by pressing and holding it. | |
| 2.3 | Words only CJ knows: "AFI set", "catalog.json", "KEHE special order", "clearance", "section", "aisle". | |
| 2.4 | The tag at the top says "Width fits" when some products are too tall or too deep. That reads like good news. | |
| 2.5 | An empty shelf says "Tap Add" but offers no button there. | |
| 2.6 | A scanned product that is not in the store's list is added as "UPC 0-12345-..." and can never be given a name. | |
| 2.7 | Names in a few places are still in capitals (scan result, compare list, sales help). | |
| 2.8 | A new person cannot get their own products in unless someone runs the data-prep scripts. | |

## 3. Look and polish

| # | What was found | Status |
|---|---|---|
| 3.1 | The six buttons on an opened product row are cramped; "Take off" wraps onto two lines on a phone. | |
| 3.2 | On the whole-set screen the grey hint strip sits oddly between the white picture and the bottom bar. | |
| 3.3 | The loading screen and the first screen are plain next to the rest. | |
| 3.4 | When a panel opens, the keyboard focus stays behind it; screen readers are not told it is a pop-up. | |
| 3.5 | Small inconsistencies in spacing, button sizes and wording between panels. | |

## 4. Looked at and kept

- Fit maths, size guesses, UPC rules, tape-measure reading, plan changes and undo: read line by line, covered by
  209 unit tests, no faults found.
- Saving on the phone: every change is saved at once; photos are saved in batches; a full phone is reported.
- Backups: importing only adds and updates, never deletes; the newer copy of a plan wins.
- Cost, retail and margin: never read by the app; files coming in are trimmed to the known fields.
- Offline: every file the app needs is saved on first open; pages update when there is a signal.
- Data-prep scripts (Python): 36 tests, 26 pass and 10 are skipped because they need the store's own files.

## 5. Cannot be checked here

- A real iPhone or Android phone (camera, Add to Home Screen, the share sheet). Tested in a simulated phone only.
- The older browser tests (`app/e2e/app.spec.js`) and the data-prep run need the store's files, which were lost
  from the build machine on 2026-11-14 and have to be uploaded again.
