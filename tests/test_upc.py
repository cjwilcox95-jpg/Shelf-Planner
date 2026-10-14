import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import upc  # noqa: E402


class CheckDigit(unittest.TestCase):
    def test_known_barcodes(self):
        # Textbook UPC-A examples with known check digits
        self.assertEqual(upc.check_digit("03600029145"), 2)
        self.assertEqual(upc.check_digit("01234567890"), 5)

    def test_zero_case(self):
        # weighted sum is a multiple of 10 -> check digit 0, not 10
        self.assertEqual(upc.check_digit("00000000000"), 0)

    def test_rejects_wrong_length(self):
        with self.assertRaises(ValueError):
            upc.check_digit("123")

    def test_valid_and_typo(self):
        self.assertTrue(upc.is_valid_upc12("036000291452"))
        self.assertFalse(upc.is_valid_upc12("036000291453"))   # last digit wrong
        self.assertFalse(upc.is_valid_upc12("036000921452"))   # two digits swapped


class Keys(unittest.TestCase):
    def test_afi_dash_format(self):
        self.assertEqual(upc.key_from_11("0-36000-29145"), "036000291452")

    def test_order_list_dropped_leading_zero(self):
        self.assertEqual(upc.key_from_11("36000-29145"), "036000291452")

    def test_brdata_no_dashes(self):
        self.assertEqual(upc.key_from_11("03600029145"), "036000291452")

    def test_all_formats_agree(self):
        keys = {upc.key_from_11(v) for v in ("0-36000-29145", "36000-29145", "03600029145", 3600029145)}
        self.assertEqual(keys, {"036000291452"})

    def test_placeholder_and_junk(self):
        self.assertIsNone(upc.key_from_11("0-00000-00000"))
        self.assertIsNone(upc.key_from_11("See Comments"))
        self.assertIsNone(upc.key_from_11(None))
        self.assertIsNone(upc.key_from_11("12345"))

    def test_full_with_check_digit(self):
        self.assertEqual(upc.key_from_full("036000291452"), ("036000291452", True))
        self.assertEqual(upc.key_from_full("36000291452"), ("036000291452", True))     # leading 0 dropped
        self.assertEqual(upc.key_from_full("0036000291452"), ("036000291452", True))   # EAN-13 form
        self.assertEqual(upc.key_from_full("036000291453"), (None, False))             # bad check digit

    def test_candidates_when_unsure(self):
        # "36000291452" could be 11 digits without a check digit, or 12 with the 0 dropped
        c = upc.candidate_keys("36000291452")
        self.assertIn("036000291452", c)
        self.assertEqual(c[0], "036000291452")   # valid full reading is tried first

    def test_pretty(self):
        self.assertEqual(upc.pretty("036000291452"), "0-36000-29145-2")


if __name__ == "__main__":
    unittest.main()
