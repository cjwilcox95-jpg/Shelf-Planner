# Data notes

What each source file is, how it writes UPCs, and the problems found in it.
The files themselves live in `data/raw/` and are **never committed** (they contain cost, retail and margin).
This page describes their layout only; it contains no cost, price or sales figures.

## Files received

| File | What it is | Items | UPC written as |
|---|---|---|---|
| `AFITMGRC.csv` | AFI grocery item file for store 752 (no header row, 22 columns) | 19,744 rows | `0-36800-47637` (11 digits, no check digit) |
| `HBC_BOOK.pdf` | AFI Retail Price Book, HBC / general merchandise, store 752, dated 10/10/26 (98 pages, printed text) | 4,123 | `0-24291-98092` (same as above) |
| `Master_Order_list_9-7-2026.xlsx` | Store order guide, sheet "Grocery", with an **Aisle** column | 1,131 rows | `54400-00005` (10 digits: leading 0 and check digit dropped), plus a few other forms |
| `scan_doc...pdf` | BRData "Sales Movement History", 9/14/2025 to 12/31/2025, 23 scanned pages, sideways, "For Selected UPCs", sorted by units sold | read by OCR (see below) | `03680008514` (11 digits, no dashes) |

Still expected: `AFI_category_master.xlsx`, `PlanogramPOC.jsx`, the Ketchup-Mustard planogram PDF.

## AFITMGRC.csv columns (as best we can tell)

0 class code, 1 class name, 2 subclass code, 3 subclass name, 4 AFI item #, 5 UPC, 6 dept, 7 pack, 8 size,
9 description, 10-19 cost / unit cost / retail / margin for two price zones (**never used**),
20 an unlabeled number (0 for every special-order item, highest for bread; possibly a shipment count; **not used**),
21 buyer code.

Safe fields we keep: UPC, description, pack, size, unit of measure, class, subclass.
There is **no vendor column** in this file or in the HBC book.

## Problems found

- **Special-order catalog mixed in.** 8,560 rows (43%) are class 389 "KEHE special order xdock, 15 case minimum". These are not normally on the shelf.
- **Fake UPC 0-00000-00000** is shared by 71 rows: price-sticker rolls, pallets, bins and shippers.
- **Duplicate UPCs.** Apart from the 0-00000-00000 group, about 40 UPCs appear twice, usually an item plus its shipper or display version.
- **Names cut off at 30 characters** (about 3,300 grocery and 1,100 HBC items).
- **HBC sizes chopped** by a 6-character column: `11.4 O` means 11.4 OZ (about 280 items). About 40 have no number at all (`TRAY`, `EA`, `10/4OZ`).
- **No check digit.** No file so far prints the full 12-digit barcode, so the check digit is calculated, not verified, until a file that includes it arrives.
- **Order list:** about a third of rows have no UPC ("See Comments" or blank). Of rows with a UPC, about 64% match the grocery file; many misses are shippers or pallets with their own codes. Aisle labels are mostly numbers 2-14, plus a few text labels ("Supplies", "Special buy", "Prod").
- **Movement report** is a paper scan, so it is read with character recognition (OCR), which can misread digits.
  Columns: UPC, W/Item (AFI item #), Description, Pack/Size, Unt/Lbs (units sold), Sales, GM$, GM%, Avg price,
  Avg cost, Units, On-hand, coupon qty and amount. **Only UPC, W/Item (to check the UPC) and Unt/Lbs are read.**
  The margin and money columns conflict with the "no cost, retail or margin" rule, so Stage 6 uses units sold only.
  Result (2026-10-15): 1,341 lines, 889 products with units sold (831 confirmed by AFI item #, 16 UPCs fixed from
  the item #, 42 in the store files without item confirmation), 7 lines with unreadable units, none out of order.
  445 lines are not in the grocery/HBC files (spot checks: yogurt, frozen pizza, i.e. other departments).
  Because the report was "For Selected UPCs", it covers few products per category (e.g. 7 of 47 in Ketchup-Mustard).

## UPC key

Strip everything but digits, left-pad to 11 digits, then add the calculated UPC-A check digit to get a 12-digit key
(`scripts/upc.py`). When a source prints 12 digits, its last digit is checked against the calculation.

## Decisions

- KEHE special-order items are **included** (the store can get them), labeled and listed after regular items.
- No prices, costs or margins in the app, ever.
- When one UPC is on several rows, the plain shelf item is kept over a shipper/display version.
- Category codes with two names use the name most rows have (one case: class 390).
