"""The movement file made from the BRData scan may hold only UPCs and units sold."""
import json
import re
import unittest
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import upc  # noqa: E402

MOVEMENT = Path(__file__).resolve().parent.parent / "data" / "build" / "movement.json"
TOP_KEYS = {"kind", "version", "source", "from", "to", "days", "selectedOnly", "items"}


@unittest.skipUnless(MOVEMENT.exists(), "movement.json not built")
class MovementFile(unittest.TestCase):
    def setUp(self):
        self.doc = json.loads(MOVEMENT.read_text())

    def test_only_safe_fields(self):
        self.assertLessEqual(set(self.doc), TOP_KEYS)
        for key, rec in self.doc["items"].items():
            self.assertLessEqual(set(rec), {"units", "check"}, key)

    def test_valid_upcs_and_units(self):
        for key, rec in self.doc["items"].items():
            self.assertTrue(upc.is_valid_upc12(key), key)
            self.assertGreaterEqual(rec["units"], 0)

    def test_no_money_words(self):
        text = MOVEMENT.read_text().lower()
        for word in ("sales\"", "gm", "margin", "cost", "retail", "price", "on_hand", "onhand"):
            self.assertNotIn(word, text)

    def test_dates(self):
        self.assertRegex(self.doc["from"] or "", r"^\d{4}-\d\d-\d\d$")
        self.assertGreater(self.doc["days"], 0)


if __name__ == "__main__":
    unittest.main()
