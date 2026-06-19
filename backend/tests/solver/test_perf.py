import time
from pathlib import Path

import pytest

from app.solver.index import Wordlist
from app.solver.run import FillResult, fill
from app.solver.templates import load_library

LIB = Path(__file__).resolve().parents[2] / "app" / "solver" / "templates"
WORDS = Path(__file__).parent / "fixtures" / "representative_wordlist.txt"


@pytest.mark.perf
def test_fill_success_rate_and_latency():
    library = load_library(LIB)
    words = Wordlist(WORDS.read_text(encoding="utf-8").split())
    # Use a handful of real seed words present in the list.
    seeds = words.by_length(7)[:20] + words.by_length(5)[:20]
    successes, durations = 0, []
    attempts = 20
    for seed_value in range(attempts):
        template = library[seed_value % len(library)]
        start = time.monotonic()
        result = fill(template, seeds, words, seed_value=seed_value, min_seeds=15, deadline_s=10.0)
        durations.append(time.monotonic() - start)
        if isinstance(result, FillResult):
            successes += 1
    assert successes / attempts >= 0.90, f"only {successes}/{attempts} filled"
    assert max(durations) <= 10.0
