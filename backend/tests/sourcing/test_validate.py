from app.sourcing.validate import is_georgian_word, revalidate, valid_length


def test_pure_georgian_passes():
    assert is_georgian_word("მთაწმინდა")


def test_latin_or_mixed_fails():
    assert not is_georgian_word("abc")
    assert not is_georgian_word("მთაabc")


def test_length_bounds():
    assert valid_length("აბგ")           # 3
    assert not valid_length("აბ")        # 2
    assert not valid_length("ა" * 14)    # 14


def test_revalidate_counts_drops():
    kept, dropped = revalidate(["მთაწმინდა", "ab", "აბ", "თბილისი"])
    assert kept == ["მთაწმინდა", "თბილისი"]
    assert dropped == 2
