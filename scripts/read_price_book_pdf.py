"""Read an AFI "Retail Price Book" PDF (like the HBC book) into safe item rows.

The PDF is a printed report in a fixed-width typewriter font, turned sideways,
with underline characters printed over every field. We rebuild each printed
line on a character grid, then cut out fixed-width columns.

ONLY safe fields are kept: UPC, department, pack, size, description,
class and subclass. Cost, unit cost, retail and margin are never stored;
the cost column is looked at only to confirm the line was read in the
right columns.

Usage: python3 -I scripts/read_price_book_pdf.py data/raw/HBC_BOOK.pdf data/build/hbc.json
(store data: write it under data/build/, which is never committed)
"""
import collections
import json
import re
import sys

import pdfplumber

CELL_W = 5.4    # width of one character, in PDF points
ROW_H = 8.4     # height of one printed line, in PDF points
LEFT = 36       # left margin, in PDF points

ITEM_LINE = re.compile(r"^\s{1,3}(\d{3,6}) (\d-\d{5}-\d{5}) (\d{3}) ")
HEADER = re.compile(r"^(MD352|PROCESS DATE|\s+RETAIL PRICE BOOK|\s+STORE|\s+ITEM\s+UPC)")


def grid_lines(path):
    """Yield (page number, text line) with every character in its grid column."""
    with pdfplumber.open(path) as pdf:
        for pno, page in enumerate(pdf.pages, 1):
            rows = collections.defaultdict(dict)
            for c in page.chars:
                if c["text"] == "_":
                    continue
                rows[round(c["top"] / ROW_H)][round((c["x0"] - LEFT) / CELL_W)] = c["text"]
            for r in sorted(rows):
                cells = rows[r]
                yield pno, "".join(cells.get(i, " ") for i in range(max(cells) + 1)).rstrip()


def read(path):
    cls = sub = None
    items, problems = [], collections.Counter()
    for pno, line in grid_lines(path):
        m = re.match(r"^\*+ CLASS (\d+) (.*)", line)
        if m:
            cls = (m[1], m[2].strip())
            continue
        m = re.match(r"^\*+ SUB-CLASS (\d+) (.*)", line)
        if m:
            sub = (m[1], m[2].strip())
            continue
        if not line.strip() or HEADER.match(line):
            continue
        m = ITEM_LINE.match(line)
        if not m:
            problems["skipped non-item line (e.g. '1 FOR 4 FOR' price note)"] += 1
            continue
        if not re.match(r"\s*\d*\.\d{4}\b", line[68:79]):
            problems["columns did not line up"] += 1
            continue
        items.append({
            "upc": m[2], "dept": m[3],
            "pack": line[25:30].strip(), "size": line[30:37].strip(),
            "description": line[37:68].strip(),
            "classCode": cls[0], "className": cls[1],
            "subclassCode": sub[0], "subclassName": sub[1],
            "page": pno,
        })
    return items, problems


if __name__ == "__main__":
    items, problems = read(sys.argv[1])
    json.dump(items, open(sys.argv[2], "w"), indent=0)
    print(f"{len(items)} items read; problems: {dict(problems) or 'none'}")
