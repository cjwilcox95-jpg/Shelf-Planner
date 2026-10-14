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

**Stage 0: project set up.** There is no app yet. See [CHANGELOG.md](CHANGELOG.md).

| Stage | What it adds | Status |
|---|---|---|
| 0 | Read the data files, set up the project | Partly done (waiting on the data files) |
| 1 | Clean product catalog (no cost data), UPC match report | Not started |
| 2 | One shelf drawn to scale, finger drag, capacity bar, search, Ketchup-Mustard demo | Not started |
| 3 | Product detail panel, editable dimensions, default-guess table | Not started |
| 4 | Several shelves, save/load/duplicate plans, undo/redo, backup, start from an AFI reset | Not started |
| 5 | Photos (camera, background removal), print/export | Not started |
| 6 | Movement-based suggestions (only when asked) | Not started |

## Project layout

```
data/raw/      Original spreadsheets go here. NEVER committed to git (they contain cost data).
```

(More folders will be added as stages are built.)

## Known limits

- No app to open yet.
- The source spreadsheets have not been loaded into this project yet.
- This code runs in a temporary cloud workspace. Until it is connected to a GitHub repository, work is only saved on a temporary machine and could be lost.
