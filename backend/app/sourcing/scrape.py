import datetime as dt
from dataclasses import dataclass
from typing import Protocol

from sqlalchemy.orm import Session

from app.ai.client import GeminiClient
from app.services.pool import create_from_extraction


@dataclass
class Article:
    url: str
    published_at: dt.datetime
    text: str


class SourceAdapter(Protocol):
    name: str
    enabled: bool
    def fetch_recent(self, within_days: int) -> list["Article"]: ...


def run_scrape(
    adapters: list[SourceAdapter], ai: GeminiClient, theme: str, db: Session, within_days: int = 31
) -> int:
    total = 0
    for adapter in adapters:
        if not adapter.enabled:
            continue
        try:
            articles = adapter.fetch_recent(within_days)
        except Exception:  # isolate per-source failure (§10)
            continue
        for article in articles:
            candidates = ai.extract(article.text, theme, [])  # snippet only; never store full body
            rows, _ = create_from_extraction(db, candidates, theme)
            for r in rows:
                r.source_url = article.url
            total += len(rows)
    return total


# ponytail: real RadioTavisuplebaAdapter/ArilimagAdapter (httpx + selectolax, robots.txt +
# rate-limit + 31-day window) deferred — blocked on Q4 RFE/RL ToS sign-off (DESIGN.md §15 Q4).
# Add behind this Protocol with enabled=False + a per-source config flag once cleared.
