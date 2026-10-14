"""UPC helpers: turn the different ways our files write a UPC into one 12-digit key.

A UPC-A barcode has 12 digits:
  1 number-system digit + 5 manufacturer digits + 5 product digits + 1 check digit.
The check digit is calculated from the other 11, so a typo usually breaks it.

How our files write UPCs:
  AFI grocery file / HBC book   0-36800-47637   11 digits, check digit left off
  Store order list              54400-00005     10 digits, leading 0 and check digit left off
  BRData movement report        03680008514     11 digits, no dashes
"""
import re


def digits(raw):
    """Keep only the digits of whatever was in the cell."""
    return re.sub(r"\D", "", str(raw if raw is not None else ""))


def check_digit(first11):
    """UPC-A check digit for an 11-digit string."""
    if len(first11) != 11 or not first11.isdigit():
        raise ValueError(f"need exactly 11 digits, got {first11!r}")
    odd = sum(int(d) for d in first11[0::2])   # positions 1, 3, 5, ... 11
    even = sum(int(d) for d in first11[1::2])  # positions 2, 4, ... 10
    return (10 - (odd * 3 + even) % 10) % 10


def is_valid_upc12(code):
    return len(code) == 12 and code.isdigit() and check_digit(code[:11]) == int(code[11])


def key_from_11(raw):
    """For files that print the first 11 digits (no check digit).

    Shorter values are padded with leading zeros (the order list drops the
    leading 0). Returns the 12-digit key, or None if it is not usable.
    """
    d = digits(raw)
    if not 6 <= len(d) <= 11:
        return None
    d = d.zfill(11)
    if d[1:] == "0" * 10:          # 0-00000-00000 is a placeholder, not a barcode
        return None
    return d + str(check_digit(d))


def key_from_full(raw):
    """For values that include the check digit (12 digits, or 13 with a leading 0,
    or fewer when leading zeros were dropped). Returns (key, verified)."""
    d = digits(raw)
    if len(d) == 13 and d.startswith("0"):
        d = d[1:]
    if not 7 <= len(d) <= 12:
        return None, False
    d = d.zfill(12)
    return (d, True) if is_valid_upc12(d) else (None, False)


def candidate_keys(raw):
    """All the 12-digit keys a value could mean when we do not know whether the
    check digit was printed. Used to match a file against the catalog."""
    out = []
    full, ok = key_from_full(raw)
    if ok:
        out.append(full)
    k = key_from_11(raw)
    if k and k not in out:
        out.append(k)
    return out


def pretty(key):
    """0-36800-47637-1 style, easy to compare with a shelf tag."""
    return f"{key[0]}-{key[1:6]}-{key[6:11]}-{key[11]}" if key and len(key) == 12 else ""
