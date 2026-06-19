from app.solver.index import Wordlist
from app.solver.run import FillFailure, FillResult, fill
from app.solver.templates import Template

# A consistent 5x5 square (across rows + down columns, all 10 words distinct).
# Row 2 (across) is "აბგდე" — the most-central length-5 slot, so it lands in the
# single reserved seed slot when min_seeds=1.
_ACROSS = ["ღოჰიტ", "იზრკუ", "აბგდე", "ღძფოხ", "წრდავ"]
_DOWN = ["ღიაღწ", "ოზბძრ", "ჰრგფდ", "იკდოა", "ტუეხვ"]
_SQUARE = _ACROSS + _DOWN


def _grid():
    return Template(id="t", rows=5, cols=5, blocks=frozenset())


def test_fill_is_deterministic():
    wl = Wordlist(_SQUARE)
    seeds = ["აბგდე"]
    a = fill(_grid(), seeds, wl, seed_value=7, min_seeds=1)
    b = fill(_grid(), seeds, wl, seed_value=7, min_seeds=1)
    assert isinstance(a, FillResult) and a.grid == b.grid


def test_fill_fails_with_reason_when_too_few_seeds():
    wl = Wordlist(_SQUARE)
    result = fill(_grid(), seeds=["აბგდე"], wordlist=wl, seed_value=1, min_seeds=20)
    assert isinstance(result, FillFailure)
    assert "seed" in result.reason.lower()


def test_seed_words_tagged_sourced():
    wl = Wordlist(_SQUARE)
    seeds = ["აბგდე"]
    result = fill(_grid(), seeds, wl, seed_value=3, min_seeds=1)
    assert isinstance(result, FillResult)
    sourced = [e for e in result.entries if e.provenance == "sourced"]
    assert any(e.answer == "აბგდე" for e in sourced)
