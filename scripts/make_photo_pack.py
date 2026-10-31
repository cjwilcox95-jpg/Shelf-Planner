"""Make a photo pack for the app from a folder of product pictures.

Each picture must be named by its UPC (any common form, e.g. 036800083004.png or
0-36800-08300.jpg). Plain white space around the product is trimmed, and each picture
is shrunk to about 400 px and saved as a small JPEG inside one JSON file that the app
imports under Plans > Import.

The pack is store data: write it under data/build/ (never committed).

Usage: python3 -I scripts/make_photo_pack.py data/build/photos/raw data/build/photos-ketchup.json --source "store website"
       (add --max-edge 300 --quality 78 for a smaller file when packing hundreds of pictures)

More than --max-photos pictures (default 2000) are split into numbered files, e.g. photos-all-1.json,
photos-all-2.json..., each loaded on its own in the app: a phone cannot read one file of 15,000 pictures
(over 350 MB) at once.
"""
import argparse
import base64
import datetime
import io
import json
import sys
from pathlib import Path

from PIL import Image, ImageChops

sys.path.insert(0, str(Path(__file__).resolve().parent))
import upc  # noqa: E402

MAX_EDGE = 400
MAX_PHOTOS = 2000


def trim_white(img, threshold=242):
    """Crop plain white (or see-through) space around the product."""
    rgba = img.convert("RGBA")
    white = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    flat = Image.alpha_composite(white, rgba).convert("RGB")
    # pixels darker than the threshold in any channel count as product
    mask = ImageChops.invert(flat).point(lambda v: 255 if v > 255 - threshold else 0).convert("L")
    box = mask.getbbox()
    if not box:
        return flat
    pad = round(max(box[2] - box[0], box[3] - box[1]) * 0.01)
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(flat.width, box[2] + pad), min(flat.height, box[3] + pad))
    return flat.crop(box)


def to_record(path, source, when, max_edge=MAX_EDGE, quality=85):
    img = trim_white(Image.open(path))
    img.thumbnail((max_edge, max_edge))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality)
    data = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    return {"data": data, "w": img.width, "h": img.height, "source": source, "addedAt": when}


def key_for(stem, known=None):
    """12 or 13 digits: the full UPC with its check digit. 11 or fewer digits could be either the UPC without its
    check digit, or a full UPC that lost its leading zero (spreadsheets do that). When the store data is at hand,
    use the reading that is a real product; otherwise take "no check digit", the usual form."""
    n = len(upc.digits(stem))
    if n >= 12:
        full, ok = upc.key_from_full(stem)
        return full if ok else None
    no_check = upc.key_from_11(stem)
    full, ok = upc.key_from_full(stem)
    if known is not None:
        hits = [k for k in (no_check, full if ok else None) if k and k in known]
        if len(hits) == 1:
            return hits[0]
    return no_check


def numbered(out, n, count):
    """photos.json -> photos-1.json, photos-2.json... (just photos.json when one file is enough)."""
    out = Path(out)
    return out if count == 1 else out.with_name(f"{out.stem}-{n}{out.suffix}")


def write_packs(photos, out, when, max_photos=MAX_PHOTOS):
    """Write the pack, split into files of at most max_photos pictures. Returns the files written."""
    keys = sorted(photos)
    size = max(1, max_photos)
    parts = [keys[i:i + size] for i in range(0, len(keys), size)] or [[]]
    files = []
    for n, part in enumerate(parts, 1):
        path = numbered(out, n, len(parts))
        doc = {"kind": "shelf-planner-photos", "version": 1, "made": when, "photos": {k: photos[k] for k in part}}
        if len(parts) > 1:
            doc["part"] = f"{n} of {len(parts)}"
        path.write_text(json.dumps(doc))
        files.append(path)
    return files


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("out")
    ap.add_argument("--source", default="imported")
    ap.add_argument("--max-edge", type=int, default=MAX_EDGE, help="longest side in pixels (smaller = smaller file)")
    ap.add_argument("--quality", type=int, default=85, help="JPEG quality 1-95")
    ap.add_argument("--max-photos", type=int, default=MAX_PHOTOS,
                    help="at most this many pictures per file; more are split into name-1.json, name-2.json...")
    ap.add_argument("--catalog", default=str(Path(__file__).resolve().parent.parent / "data/build/catalog.json"),
                    help="store data, used to tell the two readings of an 11-digit file name apart")
    a = ap.parse_args()
    when = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    known = {i["upc"] for i in json.loads(Path(a.catalog).read_text())["items"]} if Path(a.catalog).exists() else None
    photos, skipped = {}, []
    for p in sorted(Path(a.folder).iterdir()):
        if p.suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp"):
            continue
        key = key_for(p.stem, known)
        if not key:
            skipped.append(p.name)
            continue
        photos[key] = to_record(p, a.source, when, a.max_edge, a.quality)
    files = write_packs(photos, a.out, when, a.max_photos)
    for f in files:
        print(f"  {f} ({f.stat().st_size // 1024} KB)")
    print(f"{len(photos)} photos in {len(files)} file{'s' if len(files) > 1 else ''}; skipped (name is not a UPC): {skipped or 'none'}")


if __name__ == "__main__":
    main()
