"""Checks on the catalog builder, and on the finished catalog file if it has been built."""
import json
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import build_catalog as bc  # noqa: E402
import upc  # noqa: E402

CATALOG = ROOT / "data" / "build" / "catalog.json"


class Sizes(unittest.TestCase):
    def test_plain(self):
        self.assertEqual(bc.parse_size("24 OZ"), (24.0, "OZ", None))
        self.assertEqual(bc.parse_size(".5 OZ"), (0.5, "OZ", None))

    def test_hbc_cut_units_fixed(self):
        self.assertEqual(bc.parse_size("11.4 O"), (11.4, "OZ", None))
        self.assertEqual(bc.parse_size("2.65 o"), (2.65, "OZ", None))
        self.assertEqual(bc.parse_size("2.25 Q"), (2.25, "QT", None))
        self.assertEqual(bc.parse_size("10 PAI"), (10.0, "PAIR", None))

    def test_ambiguous_left_alone_and_flagged(self):
        self.assertEqual(bc.parse_size("1.25 C"), (1.25, "C", "unit cut off in source"))
        self.assertEqual(bc.parse_size("11.99"), (11.99, None, "unit cut off in source"))
        self.assertEqual(bc.parse_size("TRAY")[0], None)
        self.assertEqual(bc.parse_size("10/4OZ")[0], None)


class Displays(unittest.TestCase):
    def flagged(self, s):
        return bool(bc.DISPLAY_WORDS.search(s))

    def test_real_displays(self):
        for s in ("FDC DRINKING WATER PALLET", "MF BIG HONEY BUN SHIPPER 108CT",
                  "BBQ TOOLS ASSORTMENT DUMP BIN", "OTB CAFE STY TORT CHP 1/2 PLT"):
            self.assertTrue(self.flagged(s), s)

    def test_not_displays(self):
        for s in ("BIC FLEX 5 MENS DISP RAZOR", "CHINET NAPKIN DINNER 3 PL",
                  "SD FOAM PLT CMPRTMNT DD 10IN", "BEAR MTN BBQ GRMT BLND PLT 20#",
                  "REPURPOSE BAGS SMALL BIN 3GAL", "SD NITRILE GLOVE DISP 40CT BOX"):
            self.assertFalse(self.flagged(s), s)


@unittest.skipUnless(CATALOG.exists(), "catalog not built (raw data not present)")
class FinishedCatalog(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.text = CATALOG.read_text()
        cls.doc = json.loads(cls.text)

    def test_only_safe_fields(self):
        self.assertLessEqual(set(self.doc), bc.ALLOWED_TOP)
        for item in self.doc["items"]:
            self.assertLessEqual(set(item), bc.ALLOWED_FIELDS, item)

    def test_no_cost_looking_numbers(self):
        # AFI prints costs with 4 decimals (e.g. 15.5800); none may appear anywhere
        self.assertIsNone(re.search(r"\d\.\d{4}", self.text))
        for word in ("cost", "retail", "margin", "gp%", "price"):
            self.assertNotIn(f'"{word}', self.text.lower())

    def test_upcs_valid_and_unique(self):
        keys = [i["upc"] for i in self.doc["items"]]
        self.assertEqual(len(keys), len(set(keys)))
        for k in keys:
            self.assertTrue(upc.is_valid_upc12(k), k)

    def test_reset_items_only_safe_fields(self):
        for r in self.doc.get("resets", []):
            for row in [i for s in r["shelves"] for i in s["items"]] + r["unallocated"]:
                self.assertLessEqual(set(row), bc.ALLOWED_RESET_ITEM, row)
                self.assertTrue(upc.is_valid_upc12(row["upc"]), row)

    def test_every_item_has_names_for_its_class(self):
        for i in self.doc["items"]:
            self.assertIn(i["classCode"], self.doc["classNames"])
            self.assertIn(f'{i["classCode"]}-{i["subclassCode"]}', self.doc["subclassNames"])


if __name__ == "__main__":
    unittest.main()
