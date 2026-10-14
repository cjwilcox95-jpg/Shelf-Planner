"""Stage 1: build one clean product catalog (no cost data) plus a match report.

Reads (from data/raw/, never committed):
  AFITMGRC.csv                        AFI grocery item file
  HBC_BOOK.pdf                        AFI HBC / general merchandise price book
  Master_Order_list_*.xlsx            store order list (only used for the Aisle column)

Writes (to data/build/, never committed):
  catalog.json        the product catalog the app loads on your phone
  match_report.md     how the files line up

PRIVACY: each output field is copied from a named safe column. Cost, unit
cost, retail, margin, the unlabeled number column and AFI item numbers are
never copied. tests/test_catalog.py checks the finished file.

Usage: python3 -I scripts/build_catalog.py
"""
import collections
import csv
import datetime
import glob
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import upc  # noqa: E402
from read_price_book_pdf import read as read_price_book  # noqa: E402

RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "build"

# The only fields a catalog item may have. tests/test_catalog.py enforces this.
ALLOWED_FIELDS = {
    "upc", "description", "pack", "size", "sizeValue", "uom", "sizeNote",
    "classCode", "subclassCode", "source", "specialOrder", "display", "aisle",
}
# Top-level keys of catalog.json. Class and subclass names are stored once, here.
ALLOWED_TOP = {"kind", "version", "built", "sources", "classNames", "subclassNames", "items"}

SPECIAL_ORDER_CLASS = "389"   # KEHE special order, 15 case minimum

# Units cut short by the narrow size column in the HBC book. Only certain fixes.
UNIT_FIXES = {"O": "OZ", "Q": "QT", "PAI": "PAIR", "GAL": "GL"}

# Pallets, shippers, bins and displays: real items, but not a normal shelf product.
# Kept strict on purpose: in AFI names "DISP" usually means disposable, "PL" means ply,
# "PLT" can mean plate or pellets, and "BIN" can be a trash bin.
DISPLAY_WORDS = re.compile(
    r"\b(PALLET|SHIPPER|SHPR|DUMP BIN|BIN#\d*|DISPLAY BOX)\b"
    r"|\b(FLOOR|FLR) (DISP|DISPLAY|STAND)\b"
    r"|\b(1/4|1/2|HLF|HALF) ?(PLT|PALLET)\b"
    r"|\b\d+ ?CT DISP$")


def parse_size(text):
    """'24 OZ' -> (24.0, 'OZ', None). Returns (value, unit, note)."""
    t = text.strip()
    m = re.fullmatch(r"(\d*\.?\d+)\s*([A-Za-z][A-Za-z ]*)?", t)
    if not m:
        return None, None, "size not a simple number + unit" if t else "no size"
    value = float(m[1])
    unit = (m[2] or "").strip().upper()
    unit = UNIT_FIXES.get(unit, unit)
    if not unit:
        return value, None, "unit cut off in source"
    if unit in ("C", "L"):
        return value, unit, "unit cut off in source"
    return value, unit, None


def clean_name(s):
    return re.sub(r"\s+", " ", s.lstrip("*").strip())


def make_item(key, desc, pack, size, cls, cls_name, sub, sub_name, source):
    value, unit, note = parse_size(size)
    if unit and value is not None:
        size_text = f"{value:g} {unit}"
    else:
        size_text = size.strip()
    item = {
        "upc": key,
        "description": re.sub(r"\s+", " ", desc.strip()),
        "pack": int(pack) if str(pack).strip().isdigit() else None,
        "size": size_text,
        "sizeValue": value,
        "uom": unit,
        "classCode": cls.strip(),
        "className": clean_name(cls_name),
        "subclassCode": sub.strip(),
        "subclassName": clean_name(sub_name),
        "source": source,
        "specialOrder": cls.strip() == SPECIAL_ORDER_CLASS,
        "display": bool(DISPLAY_WORDS.search(desc.upper())),
    }
    if note:
        item["sizeNote"] = note
    return item


def read_grocery(path, log):
    items = []
    with open(path, encoding="latin-1", newline="") as f:
        for row in csv.reader(f):
            r = [c.strip() for c in row]
            if len(r) != 22:
                log["grocery: wrong number of columns"].append(r[:10])
                continue
            # 0 class, 1 class name, 2 subclass, 3 subclass name, 5 UPC, 7 pack, 8 size, 9 description
            key = upc.key_from_11(r[5])
            if not key:
                log["grocery: no usable UPC (placeholder 0-00000-00000)"].append(r[9])
                continue
            items.append(make_item(key, r[9], r[7], r[8], r[0], r[1], r[2], r[3], "grocery"))
    return items


def read_hbc(path, log):
    rows, problems = read_price_book(path)
    for k, n in problems.items():
        log[f"hbc: {k}"].extend(["(line)"] * n)
    items = []
    for r in rows:
        key = upc.key_from_11(r["upc"])
        if not key:
            log["hbc: no usable UPC (placeholder 0-00000-00000)"].append(r["description"])
            continue
        items.append(make_item(key, r["description"], r["pack"], r["size"], r["classCode"],
                               r["className"], r["subclassCode"], r["subclassName"], "hbc"))
    return items


def pick_one(group):
    """Several rows share one UPC: keep the plain shelf item if there is one."""
    return sorted(group, key=lambda i: (i["display"], i["specialOrder"], i["pack"] or 0))[0]


AISLE_FIXES = {"SUPPLIES": "Supplies", "SUPPIES": "Supplies", "SPECIAL BUY": "Special buy",
               "PROD": "Produce", "PROD.": "Produce", "MEAT": "Meat", "MEMAT": "Meat"}


def read_aisles(path, log):
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["Grocery"]
    aisles = collections.defaultdict(collections.Counter)
    rows = list(ws.iter_rows(values_only=True))
    header = [str(c).strip() if c else "" for c in rows[3]]
    if header[0] != "Aisle" or header[5] != "UPC":
        raise SystemExit(f"Order list layout changed; header row is {header[:8]}")
    stats = collections.Counter()
    for r in rows[4:]:
        if not any(c not in (None, "", " ") for c in r[:11]):
            continue
        stats["rows"] += 1
        a = r[0]
        if isinstance(a, (int, float)):
            aisle = f"Aisle {int(a)}"
        else:
            aisle = AISLE_FIXES.get(str(a or "").strip().upper())
        key = upc.key_from_11(r[5])
        name = str(r[2] or "").strip()
        if not key:
            stats["no usable UPC"] += 1
            log["order list: no usable UPC"].append(f"{name} ({str(r[5]).strip()})")
            continue
        stats["usable UPC"] += 1
        if aisle:
            aisles[key][aisle] += 1
        else:
            log["order list: aisle blank or unclear"].append(f"{name} (aisle {a!r})")
        log["_order_rows"].append((key, name, aisle))
    return {k: c.most_common(1)[0][0] for k, c in aisles.items()}, stats


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    log = collections.defaultdict(list)

    grocery = read_grocery(RAW / "AFITMGRC.csv", log)
    hbc = read_hbc(RAW / "HBC_BOOK.pdf", log)

    by_key = collections.defaultdict(list)
    for item in grocery + hbc:
        by_key[item["upc"]].append(item)
    catalog, dup_groups = [], []
    for key, group in by_key.items():
        keep = pick_one(group)
        catalog.append(keep)
        if len(group) > 1:
            dup_groups.append((keep, [g for g in group if g is not keep]))

    order_files = sorted(glob.glob(str(RAW / "Master_Order_list_*.xlsx")))
    aisle_stats = None
    if order_files:
        aisle_of, aisle_stats = read_aisles(order_files[-1], log)
        for item in catalog:
            if item["upc"] in aisle_of:
                item["aisle"] = aisle_of[item["upc"]]

    catalog.sort(key=lambda i: (i["specialOrder"], i["className"], i["subclassName"], i["description"]))
    built = datetime.date.today().isoformat()
    doc = {"kind": "shelf-planner-catalog", "version": 1, "built": built,
           "sources": ["AFITMGRC.csv", "HBC_BOOK.pdf"] + [Path(p).name for p in order_files[-1:]],
           "classNames": {}, "subclassNames": {}, "items": []}
    # A code should have one name. If the source disagrees, use the most common
    # name and list the odd ones in the report.
    votes = {"classNames": collections.defaultdict(collections.Counter),
             "subclassNames": collections.defaultdict(collections.Counter)}
    for item in catalog:
        votes["classNames"][item["classCode"]][item["className"]] += 1
        votes["subclassNames"][f'{item["classCode"]}-{item["subclassCode"]}'][item["subclassName"]] += 1
    for table, by_code in votes.items():
        for code, names in by_code.items():
            doc[table][code] = names.most_common(1)[0][0]
            for odd in list(names)[1:] if len(names) > 1 else []:
                if odd != doc[table][code]:
                    log["name conflicts"].append(
                        f"{table[:-5]} {code}: most rows say \"{doc[table][code]}\", "
                        f"{names[odd]} row(s) say \"{odd}\"")
    for item in catalog:
        slim = {k: v for k, v in item.items()
                if k not in ("className", "subclassName") and v not in (None, False)}
        extra = set(slim) - ALLOWED_FIELDS
        if extra:
            raise SystemExit(f"BUG: unexpected fields {extra}; refusing to write the catalog")
        doc["items"].append(slim)
    with open(OUT / "catalog.json", "w") as f:
        json.dump(doc, f, separators=(",", ":"))

    write_report(catalog, grocery, hbc, dup_groups, log, aisle_stats, built)
    size_kb = (OUT / "catalog.json").stat().st_size // 1024
    print(f"catalog: {len(catalog)} items, {size_kb} KB -> data/build/catalog.json")
    print("report  -> data/build/match_report.md")


def pct(a, b):
    return f"{100 * a / b:.0f}%" if b else "n/a"


def write_report(catalog, grocery, hbc, dup_groups, log, aisle_stats, built):
    c = collections.Counter
    L = []
    w = L.append
    w(f"# Catalog and match report\n\nBuilt {built}. No cost, retail or margin is included anywhere.\n")
    w("## Catalog\n")
    regular = [i for i in catalog if not i["specialOrder"]]
    w("| | Items |\n|---|---|")
    w(f"| Grocery file rows read | {len(grocery) + len(log['grocery: no usable UPC (placeholder 0-00000-00000)'])} |")
    w(f"| HBC book rows read | {len(hbc) + len(log['hbc: no usable UPC (placeholder 0-00000-00000)'])} |")
    w(f"| **Products in the catalog** | **{len(catalog)}** |")
    w(f"| Regular items | {len(regular)} |")
    w(f"| KEHE special-order items (labeled, listed last in search) | {len(catalog) - len(regular)} |")
    w(f"| Pallets / shippers / bins / displays (labeled) | {sum(i['display'] for i in catalog)} |")
    w(f"| Items with an aisle from the order list | {sum('aisle' in i for i in catalog)} |")
    w(f"| Size cut off or unclear in the source | {sum('sizeNote' in i for i in catalog)} |")
    w("")
    w("Every item starts with **guessed** shelf dimensions. None of these files has real width, height or depth.\n")

    w("## Left out\n")
    for k in ("grocery: no usable UPC (placeholder 0-00000-00000)", "hbc: no usable UPC (placeholder 0-00000-00000)"):
        names = log[k]
        if names:
            w(f"- **{k}**: {len(names)} rows, e.g. {', '.join(sorted(set(names))[:8])}")
    for k in [k for k in log if k.startswith("hbc: skipped")]:
        w(f"- **{k}**: {len(log[k])}")
    w("")

    w("## Same UPC on more than one row\n")
    w(f"{len(dup_groups)} UPCs appear more than once. The plain shelf item was kept; the others were dropped.\n")
    w("| UPC | Kept | Dropped |\n|---|---|---|")
    for keep, dropped in sorted(dup_groups, key=lambda g: g[0]["description"]):
        w(f"| {upc.pretty(keep['upc'])} | {keep['description']} ({keep['size']}) | "
          f"{'; '.join(d['description'] + ' (' + d['size'] + ')' for d in dropped)} |")
    w("")

    w("## Grocery file vs HBC book\n")
    gk = {i["upc"] for i in grocery}
    hk = {i["upc"] for i in hbc}
    w(f"- UPCs in both: {len(gk & hk)}. The two files cover different products.\n")

    if aisle_stats:
        rows = log["_order_rows"]
        keys = {k for k, _, _ in rows}
        cat_keys = {i["upc"] for i in catalog}
        found = keys & cat_keys
        w("## Store order list vs catalog\n")
        w(f"- Order list rows: {aisle_stats['rows']}")
        w(f"- Rows with no usable UPC (\"See Comments\" or blank): {aisle_stats['no usable UPC']}")
        w(f"- Distinct UPCs on the order list: {len(keys)}")
        w(f"- **Found in the catalog: {len(found)} ({pct(len(found), len(keys))})**")
        w(f"- Aisles: {', '.join(f'{a} ({n})' for a, n in sorted(c(i['aisle'] for i in catalog if 'aisle' in i).items(), key=lambda x: (len(x[0]), x[0])))}\n")
        missing = sorted({(n, k) for k, n, _ in rows if k not in cat_keys})
        w(f"### Order list UPCs not in the catalog ({len(missing)})\n")
        w("Usually a shipper or pallet with its own code, an item AFI no longer lists, or a typo in the order list.\n")
        w("| Item on order list | UPC |\n|---|---|")
        for n, k in missing:
            w(f"| {n} | {upc.pretty(k)} |")
        w("")

    if log["name conflicts"]:
        w("## Category names that disagree\n")
        for line in log["name conflicts"]:
            w(f"- {line}")
        w("")
    w("## UPC check digits\n")
    w("None of these files prints the 12th barcode digit (the check digit), so it was **calculated**, "
      "not verified. It will be verified against files that print it, such as the AFI category master.\n")
    w("## AFI category master\n")
    w("Not received yet. When it arrives, this report will show what share of the AFI reset items the store carries.\n")

    w("## Sizes cut off or unclear\n")
    w("| Description | Size as printed | Note |\n|---|---|---|")
    for i in sorted((i for i in catalog if "sizeNote" in i), key=lambda i: i["description"]):
        w(f"| {i['description']} | {i['size']} | {i['sizeNote']} |")
    (OUT / "match_report.md").write_text("\n".join(L) + "\n")


if __name__ == "__main__":
    main()
