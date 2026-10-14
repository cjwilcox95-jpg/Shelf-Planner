"""Read an AFI shelf-reset planogram PDF ("Store Level Position Report" pages).

Each reset PDF has a drawing of the set, then a table per shelf:
  Shelf: Shelf SHELF 1   Height: 1.25 in   Depth: 20.00 in
  Location (L-R)  ID  UPC  Item Description  Case Pk  Size  UOM  Facings  Capacity  Cases on Shelf

SHELF 1 is the bottom shelf. "Height: 1.25 in" is the shelf board thickness, not
the space above the shelf, so it is ignored. "UNALL" lists items AFI left off the set.

Usage: python3 -I scripts/read_afi_reset_pdf.py data/raw/AFI_01-09-24_KETCHUP-MUSTARD.pdf
"""
import json
import re
import sys

import pdfplumber

TITLE = re.compile(r"^\s*(\d+)'\s+(.+?)\s+(\d+)\s*ft\s*\(\s*(\d+)\s*ft\s+HIGH\s*\)")
SHELF = re.compile(r"Shelf:\s*Shelf\s+(.+?)\s+Height:\s*([\d.]+)\s*in\s+Depth:\s*(.+?)\s*in\s*$")
ITEM = re.compile(
    r"^\s*(\d+)\s+(\d{3,6})\s+(\d{6,13})\s+(.+?)\s+(\d+)\s+(\d*\.?\d+)\s+([A-Z]{1,4})"
    r"\s+(\d+)(?:\s+(\d+))?(?:\s+(\d+\.\d+))?\s*$")


def inches(text):
    """'19.00' -> 19.0, and the text form "1' 10.00" -> 22.0."""
    t = text.strip()
    m = re.fullmatch(r"(\d+)'\s*(\d*\.?\d*)\"?", t)
    if m:
        return int(m[1]) * 12 + (float(m[2]) if m[2] else 0.0)
    return float(t)


def read(path):
    reset = {"title": None, "widthFt": None, "heightFt": None, "shelves": [], "unallocated": []}
    current = None
    in_table = False      # the drawing pages come first; only read the position report
    problems = []
    with pdfplumber.open(path) as pdf:
        lines = [line for page in pdf.pages for line in (page.extract_text() or "").splitlines()]
    for line in lines:
        if reset["title"] is None:
            m = TITLE.match(line)
            if m:
                reset["title"] = m[2].strip()
                reset["widthFt"] = int(m[3])
                reset["heightFt"] = int(m[4])
                continue
        if "Store Level Position Report" in line:
            in_table = True
            continue
        if not in_table:
            continue
        m = SHELF.search(line)
        if m:
            label = m[1].upper()
            if label.startswith("UNALL"):
                current = reset["unallocated"]
            else:
                num = re.sub(r"\D", "", label)
                shelf = {"shelf": int(num) if num else len(reset["shelves"]) + 1,
                         "depthIn": inches(m[3]), "items": []}
                reset["shelves"].append(shelf)
                current = shelf["items"]
            continue
        m = ITEM.match(line)
        if m:
            if current is None:
                problems.append(f"item before any shelf heading: {line.strip()}")
                continue
            current.append({
                "location": int(m[1]), "afiId": m[2], "upcRaw": m[3],
                "description": re.sub(r"\s+", " ", m[4]).strip(),
                "casePack": int(m[5]), "size": f"{float(m[6]):g} {m[7]}",
                "facings": int(m[8]),
                "capacity": int(m[9]) if m[9] else None,
            })
        elif re.match(r"^\s*\d+\s+\d{3,6}\s+\d{6,}", line):
            problems.append(f"looks like an item but did not read: {line.strip()}")
    if reset["title"] is None:
        problems.append("no title line found")
    # Positions must count 1, 2, 3 ... on every shelf; a gap means a line was missed.
    for s in reset["shelves"]:
        locs = [i["location"] for i in s["items"]]
        if locs != list(range(1, len(locs) + 1)):
            problems.append(f"shelf {s['shelf']}: positions {locs} are not 1..{len(locs)}")
    return reset, problems


if __name__ == "__main__":
    r, p = read(sys.argv[1])
    print(json.dumps({k: v for k, v in r.items() if k != "shelves"}, indent=1)[:400])
    for s in r["shelves"]:
        print(f"shelf {s['shelf']} depth {s['depthIn']} in: {len(s['items'])} items, "
              f"{sum(i['facings'] for i in s['items'])} facings")
    print("problems:", p or "none")
