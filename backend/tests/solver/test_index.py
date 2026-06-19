from app.solver.index import Wordlist


def test_by_length_filters_sorts_dedupes():
    wl = Wordlist(["აბგ", "აბგ", "დევზთ", "ვზთ", "ა"])
    assert wl.by_length(3) == ["აბგ", "ვზთ"]
    assert wl.by_length(5) == ["დევზთ"]
    assert wl.by_length(1) == []  # min length 3 enforced
