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

# "4' KETCHUP-MUSTARD-AFI-1-9-24 4 ft ( 6 ft HIGH )", "BANQUET DINNERS-2DR-AFI-2-1-24 5 ft ( 4 ft 10.50 in HIGH )",
# "HUNGRY MAN-1DR-AFI-2-2-24 2 ft 6.00 in ( 4 ft 10.50 in HIGH )"
TITLE = re.compile(r"^\s*(?:\d+'\s+)?(.+?)\s+(\d+)\s*ft(?:\s+([\d.]+)\s*in)?\s*\(\s*(\d+)\s*ft(?:\s+([\d.]+)\s*in)?\s+HIGH\s*\)")
SHELF = re.compile(r"Shelf:\s*Shelf\s+(.+?)\s+Height:\s*([\d.]+)\s*in\s+Depth:\s*(.+?)\s*in\s*$")
FIXEL = re.compile(r"^\s*Fixel_ID\s+(\S+)\s+Height\s+([\d.]+)\"?\s+Depth\s+(.+?)\s*$")  # the older (2022) report layout
ITEM = re.compile(
    r"^\s*(\d+)\s+(\d{3,6})\s+(\d{6,13})\s+(.+?)\s+(\d+)\s+(\d*\.?\d+)\s+([A-Z]{1,4})"
    r"\s+(\d+)(?:\s+(\d+))?(?:\s+(\d+\.\d+))?\s*$")
# Some AFI lines print the UPC where the AFI item number belongs and the other way round.
ITEM_SWAPPED = re.compile(
    r"^\s*(\d+)\s+(\d{9,13})\s+(\d{3,6})\s+(.+?)\s+(\d+)\s+(\d*\.?\d+)\s+([A-Z]{1,4})"
    r"\s+(\d+)(?:\s+(\d+))?(?:\s+(\d+\.\d+))?\s*$")
DOORS = re.compile(r"-\s*(\d)\s*DR\b", re.I)  # freezer sets: "-2DR" = two doors
DOOR_WIDTH_IN = 30  # AFI freezer doors are 2 ft 6 in wide


def inches(text):
    """'19.00' -> 19.0, and the text form "1' 10.00" -> 22.0."""
    t = text.strip().rstrip('"')
    m = re.fullmatch(r"(\d+)'\s*(\d*\.?\d*)\"?", t)
    if m:
        return int(m[1]) * 12 + (float(m[2]) if m[2] else 0.0)
    return float(t)


def _label(label):
    """'SHELF 1' -> (None, 1); '2/3' -> door 2, shelf 3 (freezer doors); 'UNALL...' -> unallocated."""
    label = label.strip().upper()
    if label.startswith("UNALL"):
        return "unallocated", None
    m = re.fullmatch(r"(\d+)\s*/\s*(\d+)", label)
    if m:
        return int(m[1]), int(m[2])
    num = re.sub(r"\D", "", label)
    return None, int(num) if num else None


def read(path):
    with pdfplumber.open(path) as pdf:
        lines = [line for page in pdf.pages for line in (page.extract_text() or "").splitlines()]
    if any("Positions (On Fixtures" in l or "SHELF RECO" in l for l in lines):
        return read_reco(lines)
    reset = {"title": None, "widthFt": None, "heightFt": None, "doors": 1, "shelves": [], "unallocated": [], "layout": "standard"}
    current = None
    in_table = False      # the drawing pages come first; only read the position report
    problems = []
    first = next((l for l in lines if l.strip()), "")
    for line in lines:
        if reset["title"] is None:
            m = TITLE.match(line)
            if m:
                reset["title"] = m[1].strip()
                reset["widthFt"] = round((int(m[2]) * 12 + (float(m[3]) if m[3] else 0)) / 12, 2)
                reset["heightFt"] = round((int(m[4]) * 12 + (float(m[5]) if m[5] else 0)) / 12, 2)
                continue
        if "Store Level Position Report" in line or re.match(r"^\s*Position\s+AFI #\s+UPC", line):
            in_table = True
            if line.lstrip().startswith("Position"):
                reset["layout"] = "2022"
            continue
        if not in_table:
            continue
        m = SHELF.search(line) or FIXEL.match(line)
        if m:
            door, num = _label(m[1])
            if door == "unallocated":
                current = reset["unallocated"]
            else:
                num = num or len(reset["shelves"]) + 1
                same = [x for x in reset["shelves"] if x["shelf"] == num and x["door"] == (door or 1)]
                if same:  # the heading is repeated at the top of the next page
                    current = same[0]["items"]
                    continue
                shelf = {"shelf": num, "door": door or 1, "depthIn": inches(m[3]), "items": []}
                reset["shelves"].append(shelf)
                current = shelf["items"]
            continue
        m = ITEM.match(line)
        swapped = ITEM_SWAPPED.match(line) if not m else None
        if swapped:  # put the AFI item number and the UPC back in their places
            g = list(swapped.groups())
            g[1], g[2] = g[2], g[1]
            m = [line] + g
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
        elif re.match(r"^\s*\d+\s+(\d{3,6}\s+\d{6,}|\d{9,13}\s+\d{3,6})\s", line):
            problems.append(f"looks like an item but did not read: {line.strip()}")
    if reset["title"] is None:  # the 2022 layout has only a name on its first line
        reset["title"] = first.strip()
    d = DOORS.search(reset["title"] or "")
    reset["doors"] = max([int(d[1]) if d else 1] + [s["door"] for s in reset["shelves"]])
    if reset["widthFt"] is None and reset["doors"] > 1 or (reset["widthFt"] is None and d):
        reset["widthFt"] = reset["doors"] * DOOR_WIDTH_IN / 12
    if reset["widthFt"] is None:
        problems.append("no width found in the title")
    # Positions count 1, 2, 3 ... along each shelf (in a freezer, across all doors of that shelf level).
    if reset["layout"] == "standard":
        for level in sorted({s["shelf"] for s in reset["shelves"]}):
            locs = [i["location"] for s in sorted((s for s in reset["shelves"] if s["shelf"] == level), key=lambda s: s["door"])
                    for i in s["items"]]
            if locs != list(range(1, len(locs) + 1)):
                problems.append(f"shelf {level}: positions {locs} are not 1..{len(locs)}")
    # From here on, positions count from 1 on every shelf of every door, in the order listed.
    for s in reset["shelves"]:
        for n, item in enumerate(s["items"], 1):
            item["location"] = n
    return reset, problems


# A 2025-26 manufacturer recommendation in AFI's newer format ("SHELF RECO", "Positions (On Fixtures ...)").
RECO_SHELF = re.compile(r"^\s*Shelf:\s*(\d+)\b.*?h:\s*([\d.]+)\s*in\s+w:\s*([\d.]+)\s*in\s+d:\s*([\d.]+)\s*in")
RECO_ITEM = re.compile(
    r"^\s*(\d+)\s+(\d+)\s+(\d{9,13})\s+(.+?)\s+([\d.]+)\s*([A-Z]{1,3})\s+(Front|Base|Side|Back|Top|Left|Right)\s+"
    r"(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s*$")


def read_reco(lines):
    """Shelf 1 is the TOP shelf in this layout; shelves are renumbered so 1 = bottom like everywhere else.
    Columns: location, ID, UPC, brand + name, size, orientation, units on shelf, units per case, case pack out, facings."""
    reset = {"title": None, "widthFt": None, "heightFt": None, "doors": 1, "shelves": [], "unallocated": [], "layout": "reco"}
    problems, current = [], None
    for line in lines:
        m = re.search(r"Width:\s*(\d+)\s*ft", line)
        if m and reset["widthFt"] is None:
            reset["widthFt"] = int(m[1])
        m = RECO_SHELF.match(line)
        if m:
            shelf = {"shelf": int(m[1]), "door": 1, "depthIn": float(m[4]), "items": []}
            reset["shelves"].append(shelf)
            current = shelf["items"]
            continue
        m = RECO_ITEM.match(line)
        if m:
            if current is None:
                problems.append(f"item before any shelf heading: {line.strip()}")
                continue
            current.append({
                "location": len(current) + 1, "afiId": None, "upcRaw": m[3],
                "description": re.sub(r"\s+", " ", m[4]).replace("...", "").strip().upper()[:40],
                "casePack": int(m[9]), "size": f"{float(m[5]):g} {m[6]}", "facings": int(m[11]),
                "capacity": int(m[8]),
            })
        elif re.match(r"^\s*\d+\s+\d+\s+\d{9,13}\s", line):
            problems.append(f"looks like an item but did not read: {line.strip()}")
    top_first = sorted(reset["shelves"], key=lambda s: s["shelf"])
    for n, s in enumerate(reversed(top_first), 1):
        s["shelf"] = n  # 1 = bottom
    reset["title"] = "RECO"
    return reset, problems


if __name__ == "__main__":
    r, p = read(sys.argv[1])
    print(json.dumps({k: v for k, v in r.items() if k != "shelves"}, indent=1)[:400])
    for s in r["shelves"]:
        print(f"door {s.get('door', 1)} shelf {s['shelf']} depth {s['depthIn']} in: {len(s['items'])} items, "
              f"{sum(i['facings'] for i in s['items'])} facings")
    print("problems:", p or "none")
