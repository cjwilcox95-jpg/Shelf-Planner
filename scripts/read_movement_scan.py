"""Read the scanned BRData "Sales Movement History" report into a movement file for the app.

KEEPS ONLY: UPC and units sold (plus the report's date range).
Sales dollars, GM$, GM%, prices, on-hand and coupon columns are never kept, printed or written:
the OCR text for those columns is thrown away as soon as each line is read.

The report is a paper scan, so the text is read with OCR (free, open source RapidOCR, run on
this computer). Every line is checked two ways:
  1. The W/Item number (AFI item #) must belong to the same UPC in AFI's item file.
     When the UPC was misread but the item number matches, AFI's UPC is used.
  2. The report is sorted by units sold, highest first. A number that breaks that order
     was probably misread and is flagged.

Usage (needs the OCR tool; see README):
  <ocr python> -I scripts/read_movement_scan.py data/raw/scan_doc....pdf
Writes data/build/movement.json (load it in the app: Tools > Sales help) and data/build/movement_report.md.
"""
import csv
import datetime
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import upc  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
BUILD = ROOT / "data" / "build"

UNITS_RE = re.compile(r"^\d{1,3}(,?\d{3})*\.\d\d$|^\d+\.\d\d$")


def afi_items():
    """AFI item # -> UPC key, from the grocery item file (column 4 = item #, 5 = UPC)."""
    by_item = {}
    with open(RAW / "AFITMGRC.csv", encoding="latin-1", newline="") as f:
        for row in csv.reader(f):
            r = [c.strip() for c in row]
            if len(r) == 22:
                key = upc.key_from_11(r[5])
                if key and r[4].isdigit():
                    by_item.setdefault(str(int(r[4])), key)
    return by_item


def catalog_keys():
    path = BUILD / "catalog.json"
    if not path.exists():
        return set()
    return {i["upc"] for i in json.loads(path.read_text())["items"]}


def page_images(pdf, workdir):
    subprocess.run(["pdftoppm", "-r", "250", "-png", str(pdf), str(Path(workdir) / "p")], check=True)
    return sorted(Path(workdir).glob("p-*.png"))


def read_page(ocr, png):
    """Returns (rows, header_found, dates). Each row: {upc11, item, units_text}. Money columns are dropped."""
    from PIL import Image
    im = Image.open(png)
    for angle in (90, -90, 0, 180):
        rotated = im.rotate(angle, expand=True)
        path = str(png) + ".r.png"
        rotated.save(path)
        res, _ = ocr(path)
        os.remove(path)
        # (left x, middle y, text, right x)
        boxes = [(b[0][0], (b[0][1] + b[2][1]) / 2, t.strip(), b[1][0]) for b, t, _c in (res or [])]
        head = {t.replace(" ", "").lower(): (x, y, x1) for x, y, t, x1 in boxes}
        units_head = next((v for k, v in head.items() if k.startswith("unt/")), None)
        sales_head = next((v for k, v in head.items() if k == "sales"), None)
        upc_head = next((v for k, v in head.items() if k == "upc"), None)
        if units_head and sales_head and upc_head:
            break
    else:
        return [], False, []
    # The scan can be a little crooked: straighten rows using the tilt between the UPC and Unt/Lbs headings.
    slope = (units_head[1] - upc_head[1]) / (units_head[0] - upc_head[0])
    boxes = [(x, y - slope * (x - upc_head[0]), t, x1) for x, y, t, x1 in boxes]
    dates = []
    for x, y, t, _x1 in boxes:
        if y < units_head[1]:
            dates += re.findall(r"\d\d/\d\d/\d{4}", t)
    # Columns: the UPC starts under the UPC heading, the item # next to it. Numbers are right-aligned
    # under their headings, so units sold is the number whose RIGHT edge lines up with the Unt/Lbs
    # heading's right edge. Anything else (sales, margin...) is ignored, even when units is unreadable.
    units_right = units_head[2]
    gap = (sales_head[2] - units_right) / 2  # half the distance to the next column
    body = sorted((b for b in boxes if b[1] > units_head[1] + 15), key=lambda b: b[1])
    lines, cur = [], []
    for b in body:  # a new line starts when y jumps by more than half a row
        if cur and b[1] - cur[0][1] > 12:
            lines.append(cur)
            cur = []
        cur.append(b)
    if cur:
        lines.append(cur)
    rows = []
    for group in lines:
        group.sort()
        first = [t for x, y, t, _ in group if x < upc_head[0] + 120]
        upc_text = re.sub(r"\D", "", first[0]) if first else ""
        if len(upc_text) < 10:
            continue
        item_text = next((re.sub(r"\D", "", t) for x, y, t, _ in group if upc_head[0] + 120 <= x < upc_head[0] + 330), "")
        nums = [t.replace(" ", "") for x, y, t, x1 in group
                if abs(x1 - units_right) < min(gap, 70) and UNITS_RE.match(t.replace(" ", ""))]
        rows.append({"upc11": upc_text, "item": item_text, "units_text": nums[0] if len(nums) == 1 else None})
    return rows, True, dates


def main(pdf):
    from rapidocr_onnxruntime import RapidOCR
    ocr = RapidOCR()
    by_item = afi_items()
    cat = catalog_keys()
    all_rows, dates, pages_bad = [], [], []
    with tempfile.TemporaryDirectory() as d:
        pngs = page_images(pdf, d)
        for n, png in enumerate(pngs, 1):
            rows, ok, ds = read_page(ocr, png)
            if not ok:
                pages_bad.append(n)
            for r in rows:
                r["page"] = n
            all_rows += rows
            dates += ds
            print(f"page {n}: {len(rows)} lines", flush=True)

    # 1. UPC, confirmed by AFI item number
    stats = {"confirmed": 0, "corrected": 0, "in_catalog_only": 0, "rejected": 0, "no_units": 0}
    kept, problems = [], []
    for r in all_rows:
        key = upc.key_from_11(r["upc11"][-11:]) if len(r["upc11"]) >= 10 else None
        afi_key = by_item.get(str(int(r["item"]))) if r["item"] else None
        if afi_key and key == afi_key:
            how = "confirmed"
        elif afi_key:
            how, key = "corrected", afi_key
        elif key and key in cat:
            how = "in_catalog_only"
        else:
            stats["rejected"] += 1
            problems.append(f"page {r['page']}: UPC read as {r['upc11']}, item {r['item'] or '?'}: not found, left out")
            continue
        if r["units_text"] is None:
            stats["no_units"] += 1
            problems.append(f"page {r['page']}: {key}: units not readable, left out")
            continue
        stats[how] += 1
        kept.append({"upc": key, "units": float(r["units_text"].replace(",", "")), "page": r["page"], "how": how})
        if not r["units_text"].endswith(".00"):
            kept[-1]["check"] = "not a whole number: pounds, or misread"
            problems.append(f"page {r['page']}: {key}: units not a whole number (read {r['units_text']}); kept but flagged")

    # 2. Units must go down (the report is sorted by units, highest first)
    flagged = 0
    for i, r in enumerate(kept):
        prev = kept[i - 1]["units"] if i else None
        nxt = kept[i + 1]["units"] if i + 1 < len(kept) else None
        if prev is not None and nxt is not None and r["units"] > prev and r["units"] > nxt:
            r.setdefault("check", "out of order: may be misread")
            flagged += 1
            problems.append(f"page {r['page']}: {r['upc']}: units out of order (read {r['units']:g}); kept but flagged")

    items = {}
    for r in kept:
        prev = items.get(r["upc"])
        if prev:  # same UPC twice: add up
            prev["units"] += r["units"]
            continue
        items[r["upc"]] = {"units": r["units"], **({"check": r["check"]} if "check" in r else {})}

    d = sorted({datetime.datetime.strptime(x, "%m/%d/%Y").date() for x in dates})
    start, end = (d[0], d[-1]) if len(d) >= 2 else (None, None)
    days = (end - start).days + 1 if start else None
    doc = {
        "kind": "shelf-planner-movement", "version": 1,
        "source": "BRData Sales Movement History (paper scan, read by OCR)",
        "from": start.isoformat() if start else None, "to": end.isoformat() if end else None, "days": days,
        "selectedOnly": True,  # "For Selected UPCs": a product missing here is not proof it did not sell
        "items": items,
    }
    BUILD.mkdir(parents=True, exist_ok=True)
    (BUILD / "movement.json").write_text(json.dumps(doc, indent=0))
    report = [
        "# Movement scan: what was read", "",
        f"Report dates: {doc['from']} to {doc['to']} ({days} days). Pages: {len(set(r['page'] for r in all_rows))}"
        + (f"; pages not readable: {pages_bad}" if pages_bad else ""), "",
        "Only UPC and units sold are kept. Sales $, GM$, GM%, on-hand and coupons are not read into the file.", "",
        f"- Lines found: {len(all_rows)}",
        f"- UPC confirmed by AFI item number: {stats['confirmed']}",
        f"- UPC misread, fixed from the AFI item number: {stats['corrected']}",
        f"- UPC in the store files but item number not confirmed: {stats['in_catalog_only']}",
        f"- Left out (UPC not found): {stats['rejected']}",
        f"- Left out (units not readable): {stats['no_units']}",
        f"- Units flagged as out of order: {flagged}",
        f"- Products in the file: {len(items)}", "",
        "## Lines to check", "",
    ] + [f"- {p}" for p in problems]
    (BUILD / "movement_report.md").write_text("\n".join(report) + "\n")
    print("\n".join(report[:14]))


if __name__ == "__main__":
    main(Path(sys.argv[1]))
