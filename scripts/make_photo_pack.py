"""Make a photo pack for the app from a folder of product pictures.

Each picture must be named by its UPC (any common form, e.g. 036800083004.png or
0-36800-08300.jpg). Plain white space around the product is trimmed, and each picture
is shrunk to about 400 px and saved as a small JPEG inside one JSON file that the app
imports under Plans > Import.

The pack is store data: write it under data/build/ (never committed).

Usage: python3 -I scripts/make_photo_pack.py data/build/photos/raw data/build/photos-ketchup.json --source "store website"
       (add --max-edge 300 --quality 78 for a smaller file when packing hundreds of pictures)
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


def key_for(stem):
    """12 or 13 digits: the full UPC with its check digit. 11 or fewer: the UPC without its check digit.
    (Trying both readings on an 11-digit name put about 1 in 10 photos on the wrong product.)"""
    n = len(upc.digits(stem))
    if n >= 12:
        full, ok = upc.key_from_full(stem)
        return full if ok else None
    return upc.key_from_11(stem)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("out")
    ap.add_argument("--source", default="imported")
    ap.add_argument("--max-edge", type=int, default=MAX_EDGE, help="longest side in pixels (smaller = smaller file)")
    ap.add_argument("--quality", type=int, default=85, help="JPEG quality 1-95")
    a = ap.parse_args()
    when = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    photos, skipped = {}, []
    for p in sorted(Path(a.folder).iterdir()):
        if p.suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp"):
            continue
        key = key_for(p.stem)
        if not key:
            skipped.append(p.name)
            continue
        photos[key] = to_record(p, a.source, when, a.max_edge, a.quality)
    Path(a.out).write_text(json.dumps({"kind": "shelf-planner-photos", "version": 1, "made": when, "photos": photos}))
    kb = Path(a.out).stat().st_size // 1024
    print(f"{len(photos)} photos -> {a.out} ({kb} KB); skipped (name is not a UPC): {skipped or 'none'}")


if __name__ == "__main__":
    main()
