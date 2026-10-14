import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import read_afi_reset_pdf as rr  # noqa: E402
import build_catalog as bc  # noqa: E402


class Depth(unittest.TestCase):
    def test_plain_and_feet_inches(self):
        self.assertEqual(rr.inches("19.00"), 19.0)
        self.assertEqual(rr.inches("1' 10.00"), 22.0)
        self.assertEqual(rr.inches("2'"), 24.0)


class Lines(unittest.TestCase):
    def test_item_line(self):
        m = rr.ITEM.match("1 57288 1300000121 HNZ KETCHUP PLASTIC 9 64.00 OZ 3 15 1.67")
        self.assertEqual((m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9]),
                         ("1", "57288", "1300000121", "HNZ KETCHUP PLASTIC", "9", "64.00", "OZ", "3", "15"))

    def test_description_with_numbers(self):
        m = rr.ITEM.match("6 50654 7015240110 BM BRD N BTR PICKLES 16 OZ 6 16.00 OZ 2 10 1.67")
        self.assertEqual(m[4], "BM BRD N BTR PICKLES 16 OZ")
        self.assertEqual(m[8], "2")

    def test_no_capacity(self):
        # Some resets (e.g. Marie Callender) print no capacity
        m = rr.ITEM.match("3 12345 7123400001 MC POT PIE CHICKEN 8 15.00 OZ 2 1.50")
        self.assertIsNotNone(m)
        self.assertEqual((m[8], m[9]), ("2", None))

    def test_shelf_heading(self):
        m = rr.SHELF.search("Shelf: Shelf SHELF 1 Height: 1.25 in Depth: 20.00 in")
        self.assertEqual((m[1], m[3]), ("SHELF 1", "20.00"))
        m = rr.SHELF.search("Shelf: Shelf UNALL Height: 1.25 in Depth: 1' 10.00 in")
        self.assertEqual((m[1], m[3]), ("UNALL", "1' 10.00"))


class Matching(unittest.TestCase):
    def setUp(self):
        self.by_key = {"013000001212": {"specialOrder": False}, "851953005181": {"specialOrder": True}}

    def test_leading_zero_dropped_confirmed(self):
        key, status, note = bc.match_reset_item("1300000121", "57288", self.by_key,
                                                {"013000001212": "57288"}, {})
        self.assertEqual((key, status, note), ("013000001212", "carried", "confirmed by AFI item number"))

    def test_special_order(self):
        key, status, _ = bc.match_reset_item("85195300518", "1", self.by_key, {}, {})
        self.assertEqual((key, status), ("851953005181", "specialOrder"))

    def test_fallback_to_item_number(self):
        key, _, note = bc.match_reset_item("9999999999", "57288", self.by_key, {},
                                           {"57288": "013000001212"})
        self.assertEqual(key, "013000001212")
        self.assertIn("AFI item number", note)

    def test_not_found(self):
        _, status, _ = bc.match_reset_item("9999999999", "1", self.by_key, {}, {})
        self.assertEqual(status, "notFound")


if __name__ == "__main__":
    unittest.main()
