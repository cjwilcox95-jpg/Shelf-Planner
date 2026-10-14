# Changelog

Plain-English notes on what changed at each stage.

## Stage 0: project set up (2026-10-14)

- Created the project folder, git history, README and this changelog.
- Set git to ignore the raw spreadsheets and PDFs so cost data can never be committed by accident.
- Read the grocery item file, HBC price book, order list and the scanned movement report. Notes in docs/DATA_NOTES.md.
- Added a reader for AFI price book PDFs that keeps only safe fields (no cost or retail).
- Still to do: read the AFI category master, the old prototype and the Ketchup-Mustard PDF.
