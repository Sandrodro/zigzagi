import datetime as dt

from app.ai.client import ExtractedCandidate
from app.ai.fakes import FakeGeminiClient
from app.sourcing.scrape import Article, run_scrape


class _FakeAdapter:
    name = "fake"
    enabled = True

    def fetch_recent(self, within_days):
        return [Article(url="https://x/1", published_at=dt.datetime(2026, 6, 1), text="ტექსტი")]


class _BrokenAdapter:
    name = "broken"
    enabled = True

    def fetch_recent(self, within_days):
        raise RuntimeError("source down")


def test_run_scrape_isolates_source_failures(db_session):
    ai = FakeGeminiClient(extract_return=[ExtractedCandidate(surface="თბილისი", lemma="თბილისი", length=7, snippet="s", theme_relevance=0.9)])
    count = run_scrape([_FakeAdapter(), _BrokenAdapter()], ai, theme="თბილისი", db=db_session)
    db_session.flush()
    assert count == 1  # the working source still produced a candidate


def test_disabled_adapter_is_skipped(db_session):
    ai = FakeGeminiClient(extract_return=[])
    disabled = _FakeAdapter()
    disabled.enabled = False
    assert run_scrape([disabled], ai, theme="თ", db=db_session) == 0
