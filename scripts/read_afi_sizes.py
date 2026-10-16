"""Read real product sizes from the drawing page of an AFI shelf-reset PDF.

AFI draws each reset with planogram software, to scale, as boxes (not a picture). So each box is one
facing of a product at its real width and height. This reader:
  1. finds the inch ruler down the left side (0, 12, 24 ... 84) to get the scale (points per inch),
  2. finds the shelf boards (boxes as wide as the shelf, about 1 inch thick),
  3. takes the boxes standing on each board, left to right, and hands them out to AFI's position list
     in order: position 1 gets as many boxes as it has facings, then position 2, and so on.
A shelf is used only when the number of boxes matches AFI's facings exactly, and every box of a product
has the same width; otherwise it is skipped and reported.

Depth is not in a front drawing. It is worked out from AFI's capacity: "8 deep" on a 20 in shelf means
the product is between 20/9 and 20/8 in deep, so the middle (2.36 in) is used, marked as an estimate.

Usage: python3 -I scripts/read_afi_sizes.py   (reads every data/raw/AFI_*.pdf through build_catalog's reset reader)
"""
import re

import pdfplumber

R2 = lambda x: round(x * 100) / 100  # noqa: E731


def _scale(page):
    """Points per inch, from the ruler numbers on the left edge."""
    marks = [(int(w["text"]), (w["top"] + w["bottom"]) / 2) for w in page.extract_words()
             if w["x0"] < 60 and re.fullmatch(r"\d{1,3}", w["text"]) and int(w["text"]) % 12 == 0]
    by_value = {}
    for v, y in marks:
        by_value.setdefault(v, y)
    if len(by_value) < 3:
        return None
    vs = sorted(by_value)
    ys = [by_value[v] for v in vs]
    n = len(vs)
    mv, my = sum(vs) / n, sum(ys) / n
    slope = sum((v - mv) * (y - my) for v, y in zip(vs, ys)) / sum((v - mv) ** 2 for v in vs)
    return -slope if slope < 0 else None


def _dedupe(rects, key, tol):
    out = []
    for r in sorted(rects, key=key):
        if not out or abs(key(out[-1]) - key(r)) > tol:
            out.append(r)
    return out


def drawing_page(pdf):
    for page in pdf.pages:
        text = page.extract_text() or ""
        if "Store Level Position Report" in text:
            return None
        if len(page.rects) > 20:
            return page
    return None


def sizes_from_drawing(path, reset):
    """Returns ({upc: {w, h, d?, deep, shelfDepth}}, [problems])."""
    out, problems = {}, []
    with pdfplumber.open(path) as pdf:
        page = drawing_page(pdf)
        if page is None:
            return out, ["no drawing page"]
        ppi_y = _scale(page)  # up and down: from the inch ruler
        if not ppi_y:
            return out, ["no inch ruler on the drawing"]
        rects = page.rects
        flat = [r for r in rects if r["height"] < 2 * ppi_y and 50 < r["width"] < page.width * 0.95]
        if not flat:
            return out, ["no shelves drawn"]
        widest = max(r["width"] for r in flat)
        boards = _dedupe([r for r in flat if r["width"] > widest * 0.97], key=lambda r: -r["top"], tol=3)  # bottom first
        # across: the shelf itself is the ruler (AFI sometimes squeezes a wide set to fit the page)
        ppi_x = widest / (reset["widthFt"] * 12)
        if abs(ppi_x / ppi_y - 1) > 0.06:
            return out, [f"drawing scale looks wrong ({ppi_x:.2f} across vs {ppi_y:.2f} up and down)"]
        shelves = sorted(reset["shelves"], key=lambda s: s["shelf"])
        if len(boards) != len(shelves):
            return out, [f"{len(boards)} shelves drawn but AFI lists {len(shelves)}"]
        for board, shelf in zip(boards, shelves):
            left, right = board["x0"] - 2, board["x1"] + 2
            standing = [r for r in rects
                        if abs(r["bottom"] - board["top"]) < 2.5 and left <= r["x0"] < right
                        and 0.5 * ppi_x < r["width"] < widest * 0.6 and r["height"] > 0.8 * ppi_y]
            boxes = _dedupe(standing, key=lambda r: r["x0"], tol=1.5)
            items = sorted(shelf["items"], key=lambda i: i["location"])
            plan = _assign(items, boxes)
            if plan is None:
                need = sum(i["facings"] for i in items)
                problems.append(f"shelf {shelf['shelf']}: {len(boxes)} boxes for {need} facings could not be matched: skipped")
                continue
            for it, group in zip(items, plan):
                b = group[0]
                unit_w = sum(g["width"] for g in group) / it["facings"]  # one box per facing, or one box for all
                # stacked? count boxes sitting on top of this one
                high, top = 1, b["top"]
                while True:
                    above = [r for r in rects if abs(r["bottom"] - top) < 1.5 and abs(r["x0"] - b["x0"]) < 1.5
                             and abs(r["width"] - b["width"]) < 1 and r["height"] > 0.8 * ppi_y]
                    if not above:
                        break
                    high += 1
                    top = above[0]["top"]
                rec = {"w": R2(unit_w / ppi_x), "h": R2(b["height"] / ppi_y)}
                cap, depth_in = it.get("capacity"), shelf.get("depthIn")
                if cap and depth_in and cap % (it["facings"] * high) == 0:
                    deep = cap // (it["facings"] * high)
                    if deep >= 1:
                        lo, hi = depth_in / (deep + 1), depth_in / deep  # fits `deep` times, not deep+1
                        rec["d"] = R2((lo + hi) / 2)
                        rec["deep"] = deep
                        rec["shelfDepth"] = depth_in
                if high > 1:
                    rec["high"] = high
                if it.get("upc"):
                    out[it["upc"]] = rec
    return out, problems


def _same(widths):
    return max(widths) - min(widths) <= 0.03 * max(widths) + 0.3


def _assign(items, boxes):
    """Hand the boxes out to the products left to right. A product with f facings is drawn either as f equal
    boxes or as one wide box. Returns a list of box groups, or None when there is no single clear answer."""
    solutions = []

    def walk(i, k, acc):
        if len(solutions) > 1:
            return
        if i == len(items):
            if k == len(boxes):
                solutions.append(list(acc))
            return
        f = items[i]["facings"]
        group = boxes[k:k + f]
        if len(group) == f and _same([g["width"] for g in group]):
            walk(i + 1, k + f, acc + [group])
        if f > 1 and k < len(boxes):
            walk(i + 1, k + 1, acc + [[boxes[k]]])

    walk(0, 0, [])
    return solutions[0] if len(solutions) == 1 else None


def afi_sizes(resets_with_paths):
    """All resets -> {upc: {w, h, d?, reset, date}}; the newest reset wins when a product is in several."""
    sizes, report = {}, []
    for path, reset in sorted(resets_with_paths, key=lambda pr: pr[1].get("date") or ""):
        found, problems = sizes_from_drawing(path, reset)
        report.append((reset["name"], len(found), problems))
        for upc, rec in found.items():
            sizes[upc] = {**{k: rec[k] for k in ("w", "h", "d") if k in rec}, "reset": reset["name"], "date": reset.get("date")}
    return sizes, report


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent))
    import json
    from pathlib import Path
    cat = json.loads((Path(__file__).resolve().parent.parent / "data/build/catalog.json").read_text())
    raw = Path(__file__).resolve().parent.parent / "data/raw"
    pairs = [(raw / r["source"], r) for r in cat["resets"]]
    sizes, report = afi_sizes(pairs)
    for name, n, problems in report:
        print(name, n, "products", problems)
    print(len(sizes), "products with AFI sizes")
