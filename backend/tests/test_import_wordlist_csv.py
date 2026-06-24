from pathlib import Path

from scripts.import_wordlist_csv import words_from_csv


def test_words_from_csv(tmp_path: Path):
    p = tmp_path / "w.csv"
    p.write_text("﻿label\nთბილისი\nბათუმი\n\n", encoding="utf-8")
    assert words_from_csv(str(p), None, no_header=False) == ["თბილისი", "ბათუმი"]


def test_named_column_and_no_header(tmp_path: Path):
    p = tmp_path / "w.csv"
    p.write_text("id,label\n1,რუსთავი\n2,ქუთაისი\n", encoding="utf-8")
    assert words_from_csv(str(p), "label", no_header=False) == ["რუსთავი", "ქუთაისი"]

    p.write_text("მცხეთა\nგორი\n", encoding="utf-8")
    assert words_from_csv(str(p), None, no_header=True) == ["მცხეთა", "გორი"]
