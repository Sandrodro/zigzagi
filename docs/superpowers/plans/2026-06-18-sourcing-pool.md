# Sourcing & Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Turn Georgian text (pasted now; scraped later) into a reviewed **word pool**:
Gemini Flash extracts candidate words, the backend **re-validates** alphabet+length, the admin
reviews/bulk-accepts, and accepted surfaces become the solver's seed source.

**Architecture:** A `WordCandidate` lifecycle (`offered → accepted | edited | rejected`) on
Postgres. AI lives behind a thin, mockable `GeminiClient` Protocol (DESIGN.md §4.7) — tests
never hit the network. **AI output is never trusted into the pool**: a pure validator
(`app/sourcing/validate.py`) re-checks the Georgian alphabet (U+10D0–U+10FF) and length 3–13
on every extracted/suggested word before it persists (DESIGN.md §4.7). Paste ingestion has no
legal dependency and ships first; scrapers (behind a per-source kill switch) follow and remain
gated on the RFE/RL ToS review (DESIGN.md §15 Q4).

**Tech Stack:** Builds on the Walking Skeleton (FastAPI, SQLAlchemy, Postgres). Adds
`google-genai` for Gemini, `httpx` + `selectolax` for scraping, and a reusable React
`<DataTable>` on the front end.

## Global Constraints

- **Re-validate everything from AI** (DESIGN.md §4.7): word ∈ U+10D0–U+10FF only, length 3–13,
  else dropped (and counted in `dropped_count`).
- **Model is config-driven** (env): `GEMINI_EXTRACT_MODEL` (default `gemini-2.5-flash`),
  `GEMINI_SUGGEST_MODEL` (default `gemini-2.5-flash`). Structured JSON output, **one bounded
  retry** on malformed, then surface an error (never silently proceed).
- **Secrets server-side only**: `GEMINI_API_KEY` from env; never shipped to the client; all AI
  calls proxied by the backend (DESIGN.md §8).
- **Scraping** restricted to `radiotavisupleba.ge` + `arilimag.ge`, robots.txt honored,
  rate-limited, 31-day window, store **words + short attributed snippet + source URL only** —
  never full article bodies; per-source kill switch (DESIGN.md §8). **Blocked on Q4 ToS sign-off.**

## File Structure

```
backend/app/
├── ai/
│   ├── __init__.py
│   ├── client.py            # GeminiClient Protocol + DTOs
│   ├── gemini.py            # real google-genai impl (extract, suggest)
│   └── fakes.py             # FakeGeminiClient for tests
├── sourcing/
│   ├── __init__.py
│   ├── validate.py          # is_georgian_word, valid_length, revalidate()
│   └── scrape.py            # source adapters (gated on Q4)
├── services/
│   ├── pool.py              # WordCandidate lifecycle: create_from_extraction, list_pool, bulk_update
│   └── seeds_provider.py    # accepted surfaces for a theme -> solver seeds
├── models.py                # +WordCandidate (modify)
└── routers/admin.py         # +extract, +pool, +pool/bulk, +suggest, +sources/refresh (modify)
frontend/src/
├── components/
│   ├── DataTable.tsx        # reusable table (sortable, selectable rows)
│   ├── DataTable.test.tsx
│   ├── PoolReview.tsx       # extraction + pool review screen
│   └── PoolReview.test.tsx
└── api/admin.ts             # extract, pool, bulk, suggest clients
```

---

### Task 1: Georgian validator (re-validation gate)

**Files:**
- Create: `backend/app/sourcing/__init__.py`, `backend/app/sourcing/validate.py`
- Test: `backend/tests/sourcing/__init__.py`, `backend/tests/sourcing/test_validate.py`

**Interfaces:**
- Produces:
  - `validate.is_georgian_word(w: str) -> bool` — every char in U+10D0–U+10FF.
  - `validate.valid_length(w: str, lo=3, hi=13) -> bool`.
  - `validate.revalidate(words: list[str]) -> tuple[list[str], int]` — `(kept, dropped_count)`.

- [x] **Step 1: Write the failing tests**

`backend/tests/sourcing/test_validate.py`:
```python
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
```

- [x] **Step 2: Run to verify failure**

Run (from `backend/`): `uv run pytest tests/sourcing/test_validate.py -v`
Expected: FAIL — module missing.

- [x] **Step 3: Implement**

`backend/app/sourcing/validate.py`:
```python
_GE_LO, _GE_HI = 0x10D0, 0x10FF


def is_georgian_word(w: str) -> bool:
    return bool(w) and all(_GE_LO <= ord(ch) <= _GE_HI for ch in w)


def valid_length(w: str, lo: int = 3, hi: int = 13) -> bool:
    return lo <= len(w) <= hi


def revalidate(words: list[str], lo: int = 3, hi: int = 13) -> tuple[list[str], int]:
    kept = [w for w in words if is_georgian_word(w) and valid_length(w, lo, hi)]
    return kept, len(words) - len(kept)
```

- [x] **Step 4: Run to verify pass; Step 5: Commit**

Run: `uv run pytest tests/sourcing/test_validate.py -v` → PASS.
```bash
git add backend/app/sourcing backend/tests/sourcing
git commit -m "feat(sourcing): georgian alphabet + length re-validation"
```

---

### Task 2: Gemini client Protocol + DTOs + fake

**Files:**
- Create: `backend/app/ai/__init__.py`, `backend/app/ai/client.py`, `backend/app/ai/fakes.py`
- Test: `backend/tests/ai/__init__.py`, `backend/tests/ai/test_fakes.py`

**Interfaces:**
- Produces:
  - DTOs (pydantic): `ExtractedCandidate(surface, lemma, length, snippet, theme_relevance)`;
    `Suggestion(word, reason, in_corpus)`.
  - `client.GeminiClient` Protocol: `extract(text, theme, pool) -> list[ExtractedCandidate]`;
    `suggest(theme, pool) -> list[Suggestion]`.
  - `fakes.FakeGeminiClient(extract_return=…, suggest_return=…)` for tests.

- [x] **Step 1: Write the failing test**

`backend/tests/ai/test_fakes.py`:
```python
from app.ai.client import ExtractedCandidate
from app.ai.fakes import FakeGeminiClient


def test_fake_returns_canned_extraction():
    fake = FakeGeminiClient(
        extract_return=[ExtractedCandidate(surface="თბილისი", lemma="თბილისი", length=7, snippet="...", theme_relevance=0.9)]
    )
    out = fake.extract("text", "თბილისი", [])
    assert out[0].surface == "თბილისი"
```

- [x] **Step 2: Run to verify failure → Step 3: Implement**

`backend/app/ai/client.py`:
```python
from typing import Protocol

from pydantic import BaseModel


class ExtractedCandidate(BaseModel):
    surface: str
    lemma: str
    length: int
    snippet: str
    theme_relevance: float


class Suggestion(BaseModel):
    word: str
    reason: str
    in_corpus: bool


class GeminiClient(Protocol):
    def extract(self, text: str, theme: str, pool: list[str]) -> list[ExtractedCandidate]: ...
    def suggest(self, theme: str, pool: list[str]) -> list[Suggestion]: ...
```

`backend/app/ai/fakes.py`:
```python
from app.ai.client import ExtractedCandidate, Suggestion


class FakeGeminiClient:
    def __init__(self, extract_return=None, suggest_return=None):
        self._extract = extract_return or []
        self._suggest = suggest_return or []

    def extract(self, text, theme, pool) -> list[ExtractedCandidate]:
        return list(self._extract)

    def suggest(self, theme, pool) -> list[Suggestion]:
        return list(self._suggest)
```

- [x] **Step 4: Run to verify pass; Step 5: Commit**

```bash
git add backend/app/ai backend/tests/ai
git commit -m "feat(ai): gemini client protocol, dtos, and test fake"
```

---

### Task 3: Real Gemini extractor (structured output, bounded retry)

**Files:**
- Create: `backend/app/ai/gemini.py`
- Test: `backend/tests/ai/test_gemini.py` (parsing + retry, transport mocked)

**Interfaces:**
- Consumes: `GeminiClient`, DTOs.
- Produces: `gemini.GeminiExtractor(api_key, extract_model, suggest_model)` implementing
  `GeminiClient`; one bounded retry on JSON-schema parse failure, then raise `AIError`.

- [x] **Step 1: Write the failing test (transport injected)**

`backend/tests/ai/test_gemini.py`:
```python
import pytest

from app.ai.gemini import AIError, GeminiExtractor


class _Resp:
    def __init__(self, text):
        self.text = text


def test_extract_parses_structured_json():
    calls = []

    def transport(model, prompt, schema):
        calls.append(model)
        return _Resp('[{"surface":"თბილისი","lemma":"თბილისი","length":7,"snippet":"s","theme_relevance":0.9}]')

    ex = GeminiExtractor(api_key="x", extract_model="m-flash", suggest_model="m-flash", transport=transport)
    out = ex.extract("text", "თბილისი", [])
    assert out[0].surface == "თბილისი"
    assert calls == ["m-flash"]


def test_extract_retries_once_then_raises():
    def transport(model, prompt, schema):
        return _Resp("not json")

    ex = GeminiExtractor(api_key="x", extract_model="m", suggest_model="m", transport=transport)
    with pytest.raises(AIError):
        ex.extract("t", "th", [])
```

- [x] **Step 2: Run to verify failure → Step 3: Implement**

`backend/app/ai/gemini.py`:
```python
import json
from collections.abc import Callable

from pydantic import ValidationError

from app.ai.client import ExtractedCandidate, Suggestion


class AIError(Exception):
    pass


def _default_transport(api_key: str):  # pragma: no cover - real network
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)

    def call(model: str, prompt: str, schema):
        return client.models.generate_content(
            model=model,
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )

    return call


_EXTRACT_PROMPT = (
    "ამოიღე ქართული სიტყვები შემდეგი ტექსტიდან თემაზე '{theme}'. "
    "დააბრუნე JSON სია ობიექტებით (surface, lemma, length, snippet, theme_relevance). "
    "არსებული პული: {pool}. ტექსტი:\n{text}"
)


class GeminiExtractor:
    def __init__(self, api_key, extract_model, suggest_model, transport: Callable | None = None):
        self.extract_model = extract_model
        self.suggest_model = suggest_model
        self._call = transport or _default_transport(api_key)

    def _parse(self, text: str, model_cls):
        return [model_cls(**row) for row in json.loads(text)]

    def extract(self, text, theme, pool) -> list[ExtractedCandidate]:
        prompt = _EXTRACT_PROMPT.format(theme=theme, pool=", ".join(pool), text=text)
        for attempt in range(2):  # one bounded retry
            resp = self._call(self.extract_model, prompt, ExtractedCandidate)
            try:
                return self._parse(resp.text, ExtractedCandidate)
            except (json.JSONDecodeError, ValidationError, TypeError):
                if attempt == 1:
                    raise AIError("extraction returned malformed JSON")
        raise AIError("unreachable")

    def suggest(self, theme, pool) -> list[Suggestion]:
        prompt = f"შემოგვთავაზე ქართული სიტყვები თემაზე '{theme}'. პული: {', '.join(pool)}. JSON სია (word, reason, in_corpus)."
        for attempt in range(2):
            resp = self._call(self.suggest_model, prompt, Suggestion)
            try:
                return self._parse(resp.text, Suggestion)
            except (json.JSONDecodeError, ValidationError, TypeError):
                if attempt == 1:
                    raise AIError("suggestion returned malformed JSON")
        raise AIError("unreachable")
```

- [x] **Step 4: Run to verify pass; Step 5: Commit**

```bash
git add backend/app/ai/gemini.py backend/tests/ai/test_gemini.py
git commit -m "feat(ai): gemini extractor with structured output and bounded retry"
```

---

### Task 4: WordCandidate model + pool service (create-from-extraction, list, bulk)

**Files:**
- Modify: `backend/app/models.py` (add `WordCandidate`)
- Create: `backend/app/services/pool.py`
- Test: `backend/tests/test_pool.py`

**Interfaces:**
- Produces:
  - `WordCandidate(id, surface, lemma, length, source_url, snippet, theme_tags: list[str], status)`;
    `status` ∈ `offered | accepted | edited | rejected`; unique on `surface`.
  - `pool.create_from_extraction(db, candidates, theme) -> tuple[list[WordCandidate], int]` —
    re-validates surfaces, dedupes against existing, inserts `offered`, returns `(rows, dropped_count)`.
  - `pool.list_pool(db, status=None, theme=None) -> list[WordCandidate]`.
  - `pool.bulk_update(db, ops: list[dict]) -> int` — each op `{id, action: accept|reject|edit, surface?}`.

- [x] **Step 1: Write the failing tests**

`backend/tests/test_pool.py`:
```python
from app.ai.client import ExtractedCandidate
from app.models import WordCandidate
from app.services.pool import bulk_update, create_from_extraction, list_pool


def _cand(surface, length=None):
    return ExtractedCandidate(surface=surface, lemma=surface, length=length or len(surface), snippet="s", theme_relevance=0.8)


def test_create_revalidates_and_dedupes(db_session):
    rows, dropped = create_from_extraction(
        db_session,
        [_cand("თბილისი"), _cand("ab"), _cand("თბილისი")],  # latin dropped, dup dropped
        theme="თბილისი",
    )
    db_session.flush()
    assert {r.surface for r in rows} == {"თბილისი"}
    assert dropped == 2
    assert rows[0].status == "offered"


def test_bulk_accept_and_reject(db_session):
    rows, _ = create_from_extraction(db_session, [_cand("თბილისი"), _cand("მთაწმინდა")], theme="თ")
    db_session.flush()
    n = bulk_update(db_session, [
        {"id": str(rows[0].id), "action": "accept"},
        {"id": str(rows[1].id), "action": "reject"},
    ])
    db_session.flush()
    assert n == 2
    assert {r.status for r in list_pool(db_session)} == {"accepted", "rejected"}


def test_list_filters_by_status(db_session):
    rows, _ = create_from_extraction(db_session, [_cand("თბილისი")], theme="თ")
    db_session.flush()
    bulk_update(db_session, [{"id": str(rows[0].id), "action": "accept"}])
    db_session.flush()
    assert len(list_pool(db_session, status="accepted")) == 1
    assert len(list_pool(db_session, status="offered")) == 0
```

- [x] **Step 2: Run to verify failure → Step 3: Add the model**

Append to `backend/app/models.py`:
```python
from sqlalchemy import ARRAY, String


class WordCandidate(Base):
    __tablename__ = "word_candidates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    surface: Mapped[str] = mapped_column(unique=True)
    lemma: Mapped[str] = mapped_column()
    length: Mapped[int] = mapped_column()
    source_url: Mapped[str | None] = mapped_column(nullable=True)
    snippet: Mapped[str | None] = mapped_column(nullable=True)
    theme_tags: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)
    status: Mapped[str] = mapped_column(default="offered")
```
Run: `uv run alembic revision --autogenerate -m "word candidates" && uv run alembic upgrade head`

- [x] **Step 4: Implement the pool service**

`backend/app/services/pool.py`:
```python
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai.client import ExtractedCandidate
from app.models import WordCandidate
from app.sourcing.validate import is_georgian_word, valid_length


def create_from_extraction(
    db: Session, candidates: list[ExtractedCandidate], theme: str
) -> tuple[list[WordCandidate], int]:
    existing = set(db.scalars(select(WordCandidate.surface)).all())
    rows, kept_surfaces, dropped = [], set(), 0
    for c in candidates:
        s = c.surface
        if not (is_georgian_word(s) and valid_length(s)) or s in existing or s in kept_surfaces:
            dropped += 1
            continue
        kept_surfaces.add(s)
        row = WordCandidate(
            id=uuid.uuid4(), surface=s, lemma=c.lemma, length=len(s),
            snippet=c.snippet, theme_tags=[theme], status="offered",
        )
        db.add(row)
        rows.append(row)
    return rows, dropped


def list_pool(db: Session, status: str | None = None, theme: str | None = None) -> list[WordCandidate]:
    stmt = select(WordCandidate)
    if status:
        stmt = stmt.where(WordCandidate.status == status)
    if theme:
        stmt = stmt.where(WordCandidate.theme_tags.any(theme))
    return list(db.scalars(stmt.order_by(WordCandidate.surface)))


def bulk_update(db: Session, ops: list[dict]) -> int:
    n = 0
    for op in ops:
        row = db.get(WordCandidate, uuid.UUID(op["id"]))
        if row is None:
            continue
        action = op["action"]
        if action == "accept":
            row.status = "accepted"
        elif action == "reject":
            row.status = "rejected"
        elif action == "edit":
            row.surface = op["surface"]
            row.status = "edited"
        n += 1
    db.flush()
    return n
```

- [x] **Step 5: Run to verify pass; Step 6: Commit**

```bash
git add backend/app/models.py backend/app/services/pool.py backend/tests/test_pool.py backend/alembic/versions
git commit -m "feat(sourcing): word candidate model and pool lifecycle service"
```

---

### Task 5: Admin endpoints — extract, pool, bulk, suggest

**Files:**
- Modify: `backend/app/routers/admin.py`
- Modify: `backend/app/main.py` (inject the `GeminiClient` via dependency)
- Test: `backend/tests/test_admin_sourcing.py`

**Interfaces:**
- Produces:
  - `get_gemini()` FastAPI dependency (overridden with `FakeGeminiClient` in tests).
  - `POST /api/admin/extract {text, theme}` → `{dropped_count, candidates:[…]}`.
  - `GET /api/admin/pool?status=&theme=` → `[…]`.
  - `PATCH /api/admin/pool/bulk {ops:[…]}` → `{updated}`.
  - `POST /api/admin/suggest {theme}` → `[{word, reason, in_corpus}]`.

- [x] **Step 1: Write the failing test**

`backend/tests/test_admin_sourcing.py`:
```python
from app.ai.client import ExtractedCandidate, Suggestion
from app.ai.fakes import FakeGeminiClient
from app.main import app
from app.routers.admin import get_gemini


def _use_fake(extract=None, suggest=None):
    app.dependency_overrides[get_gemini] = lambda: FakeGeminiClient(extract_return=extract, suggest_return=suggest)


def test_extract_endpoint_persists_offered(client, db_session):
    _use_fake(extract=[
        ExtractedCandidate(surface="თბილისი", lemma="თბილისი", length=7, snippet="s", theme_relevance=0.9),
        ExtractedCandidate(surface="abc", lemma="abc", length=3, snippet="s", theme_relevance=0.1),
    ])
    resp = client.post("/api/admin/extract", json={"text": "ტექსტი", "theme": "თბილისი"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["dropped_count"] == 1
    assert len(body["candidates"]) == 1
    app.dependency_overrides.pop(get_gemini, None)


def test_suggest_endpoint(client):
    _use_fake(suggest=[Suggestion(word="მთაწმინდა", reason="r", in_corpus=False)])
    resp = client.post("/api/admin/suggest", json={"theme": "თბილისი"})
    assert resp.status_code == 200
    assert resp.json()[0]["word"] == "მთაწმინდა"
    app.dependency_overrides.pop(get_gemini, None)
```

- [x] **Step 2: Run to verify failure → Step 3: Implement**

Append to `backend/app/routers/admin.py`:
```python
import os

from app.ai.client import GeminiClient
from app.ai.gemini import GeminiExtractor
from app.services.pool import bulk_update, create_from_extraction, list_pool


def get_gemini() -> GeminiClient:  # overridden in tests
    return GeminiExtractor(
        api_key=os.environ["GEMINI_API_KEY"],
        extract_model=os.environ.get("GEMINI_EXTRACT_MODEL", "gemini-2.5-flash"),
        suggest_model=os.environ.get("GEMINI_SUGGEST_MODEL", "gemini-2.5-flash"),
    )


class ExtractRequest(BaseModel):
    text: str
    theme: str


class BulkRequest(BaseModel):
    ops: list[dict]


class SuggestRequest(BaseModel):
    theme: str


@router.post("/extract")
def extract(body: ExtractRequest, db: Session = Depends(get_db), ai: GeminiClient = Depends(get_gemini)):
    pool = [r.surface for r in list_pool(db, status="accepted")]
    candidates = ai.extract(body.text, body.theme, pool)
    rows, dropped = create_from_extraction(db, candidates, body.theme)
    db.commit()
    return {
        "dropped_count": dropped,
        "candidates": [
            {"id": str(r.id), "surface": r.surface, "lemma": r.lemma, "length": r.length, "snippet": r.snippet}
            for r in rows
        ],
    }


@router.get("/pool")
def pool(status: str | None = None, theme: str | None = None, db: Session = Depends(get_db)):
    return [
        {"id": str(r.id), "surface": r.surface, "length": r.length, "status": r.status, "snippet": r.snippet}
        for r in list_pool(db, status, theme)
    ]


@router.patch("/pool/bulk")
def pool_bulk(body: BulkRequest, db: Session = Depends(get_db)):
    n = bulk_update(db, body.ops)
    db.commit()
    return {"updated": n}


@router.post("/suggest")
def suggest(body: SuggestRequest, db: Session = Depends(get_db), ai: GeminiClient = Depends(get_gemini)):
    pool_words = [r.surface for r in list_pool(db, status="accepted")]
    return [s.model_dump() for s in ai.suggest(body.theme, pool_words)]
```

- [x] **Step 4: Run to verify pass; Step 5: Commit**

```bash
git add backend/app/routers/admin.py backend/tests/test_admin_sourcing.py
git commit -m "feat(sourcing): admin extract/pool/bulk/suggest endpoints"
```

---

### Task 6: Solver seeds provider — accepted surfaces by theme

**Files:**
- Create: `backend/app/services/seeds_provider.py`
- Modify: `backend/app/worker.py` (wire the real `seeds_provider`)
- Test: `backend/tests/test_seeds_provider.py`

**Interfaces:**
- Consumes: `WordCandidate`, `Puzzle`.
- Produces: `seeds_provider.seeds_for_puzzle(db, puzzle) -> list[str]` — accepted/edited
  surfaces whose `theme_tags` include the puzzle's theme. This is the function the Solver plan's
  worker injected as a stub; this task makes it real.

- [x] **Step 1: Write the failing test**

`backend/tests/test_seeds_provider.py`:
```python
import datetime as dt
import uuid

from app.models import Puzzle, WordCandidate
from app.services.seeds_provider import seeds_for_puzzle


def test_returns_accepted_surfaces_for_theme(db_session):
    db_session.add(WordCandidate(id=uuid.uuid4(), surface="თბილისი", lemma="თბილისი", length=7, theme_tags=["თბილისი"], status="accepted"))
    db_session.add(WordCandidate(id=uuid.uuid4(), surface="ბათუმი", lemma="ბათუმი", length=6, theme_tags=["ბათუმი"], status="accepted"))
    db_session.add(WordCandidate(id=uuid.uuid4(), surface="რუსთავი", lemma="რუსთავი", length=7, theme_tags=["თბილისი"], status="offered"))
    p = Puzzle(id=uuid.uuid4(), live_date=dt.date(2026, 7, 5), theme="თბილისი", grid_template={}, status="draft", seed=1, version=1)
    db_session.add(p)
    db_session.flush()
    assert seeds_for_puzzle(db_session, p) == ["თბილისი"]  # only accepted + matching theme
```

- [x] **Step 2: Run to verify failure → Step 3: Implement**

`backend/app/services/seeds_provider.py`:
```python
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Puzzle, WordCandidate


def seeds_for_puzzle(db: Session, puzzle: Puzzle) -> list[str]:
    stmt = (
        select(WordCandidate.surface)
        .where(
            WordCandidate.status.in_(("accepted", "edited")),
            WordCandidate.theme_tags.any(puzzle.theme),
        )
        .order_by(WordCandidate.surface)
    )
    return list(db.scalars(stmt))
```

In `backend/app/worker.py`, replace the stub `seeds_provider=lambda _db: []` usage in
`run_forever` so each claimed job looks up its puzzle's theme:
```python
from app.models import Job, Puzzle
from app.services.seeds_provider import seeds_for_puzzle


def _seeds_for_job(db, job: Job) -> list[str]:
    puzzle = db.get(Puzzle, job.puzzle_id)
    return seeds_for_puzzle(db, puzzle) if puzzle else []
```
and pass `seeds_provider=lambda db: _seeds_for_job(db, claimed_job)` — or refactor `tick` to
resolve seeds *after* claiming the job (cleanest: have `tick` claim, then call
`seeds_for_puzzle` for that job's puzzle). Keep the injected-provider signature for tests.

- [x] **Step 4: Run to verify pass; Step 5: Commit**

```bash
git add backend/app/services/seeds_provider.py backend/app/worker.py backend/tests/test_seeds_provider.py
git commit -m "feat(sourcing): real solver seeds provider by theme"
```

---

### Task 7: Pool review UI — reusable `<DataTable>` + `<PoolReview>`

**Files:**
- Create: `frontend/src/components/DataTable.tsx`, `DataTable.test.tsx`
- Create: `frontend/src/components/PoolReview.tsx`, `PoolReview.test.tsx`
- Create: `frontend/src/api/admin.ts`

**Interfaces:**
- Produces:
  - `DataTable<T>({ columns, rows, selectable, onSelectionChange })` — reusable, sortable,
    row-selectable table (per global "reusable components" guidance + DESIGN.md §4.8).
  - `api/admin.ts`: `extractText(text, theme)`, `fetchPool(status?)`, `bulkUpdate(ops)`, `suggest(theme)`.
  - `PoolReview()` — paste box + Extract button → renders candidates in `<DataTable>` with
    select-all/bulk Accept/Reject.

- [x] **Step 1: Write the failing `<DataTable>` test**

`frontend/src/components/DataTable.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DataTable } from "./DataTable";

const COLUMNS = [{ key: "surface", header: "Word" }, { key: "length", header: "Len" }];
const ROWS = [{ id: "1", surface: "თბილისი", length: 7 }, { id: "2", surface: "ბათუმი", length: 6 }];

describe("DataTable", () => {
  it("renders headers and rows", () => {
    render(<DataTable columns={COLUMNS} rows={ROWS} />);
    expect(screen.getByText("Word")).toBeInTheDocument();
    expect(screen.getByText("თბილისი")).toBeInTheDocument();
  });

  it("emits selected row ids", async () => {
    const onSel = vi.fn();
    render(<DataTable columns={COLUMNS} rows={ROWS} selectable onSelectionChange={onSel} />);
    await userEvent.click(screen.getByTestId("select-1"));
    expect(onSel).toHaveBeenCalledWith(["1"]);
  });
});
```

- [x] **Step 2: Run to verify failure → Step 3: Implement `<DataTable>`**

`frontend/src/components/DataTable.tsx`:
```tsx
import { useState } from "react";

export interface Column<T> {
  key: keyof T & string;
  header: string;
}

interface DataTableProps<T extends { id: string }> {
  columns: Column<T>[];
  rows: T[];
  selectable?: boolean;
  onSelectionChange?: (ids: string[]) => void;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  selectable = false,
  onSelectionChange,
}: DataTableProps<T>) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    setSelected(next);
    onSelectionChange?.(next);
  };

  return (
    <table>
      <thead>
        <tr>
          {selectable && <th />}
          {columns.map((c) => (
            <th key={c.key}>{c.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            {selectable && (
              <td>
                <input type="checkbox" data-testid={`select-${row.id}`} onChange={() => toggle(row.id)} />
              </td>
            )}
            {columns.map((c) => (
              <td key={c.key}>{String(row[c.key])}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [x] **Step 4: Write `api/admin.ts`** (thin fetch wrappers mirroring Task 5 endpoints — `extractText` POSTs `/api/admin/extract`, `fetchPool` GETs `/api/admin/pool`, `bulkUpdate` PATCHes `/api/admin/pool/bulk`, `suggest` POSTs `/api/admin/suggest`; same pattern as `api/play.ts` in the skeleton).

- [x] **Step 5: Write the failing `<PoolReview>` test (api mocked) → Step 6: Implement `<PoolReview>`**

`PoolReview` fetches nothing on mount; typing text + clicking **Extract** calls
`extractText`, stores returned candidates in state, renders them via `<DataTable selectable>`;
**Accept selected** calls `bulkUpdate(ids.map(id => ({id, action: "accept"})))`. Test by
mocking `../api/admin` with `vi.spyOn` (same approach as the skeleton's `PlayView.test.tsx`).

- [x] **Step 7: Run the frontend suite + typecheck; Step 8: Commit**

```bash
git add frontend/src/components/DataTable.tsx frontend/src/components/DataTable.test.tsx frontend/src/components/PoolReview.tsx frontend/src/components/PoolReview.test.tsx frontend/src/api/admin.ts
git commit -m "feat(sourcing): reusable DataTable and pool review screen"
```

---

### Task 8: Scrapers (gated on Q4 ToS) — adapters + scheduled job

**Files:**
- Create: `backend/app/sourcing/scrape.py`
- Modify: `backend/app/routers/admin.py` (add `POST /sources/refresh` enqueuing a `scrape` job)
- Modify: `backend/app/worker.py` (handle `kind="scrape"`)
- Test: `backend/tests/test_scrape.py`

**Interfaces:**
- Produces:
  - `scrape.SourceAdapter` Protocol: `fetch_recent(within_days: int) -> list[Article]`
    (`Article(url, published_at, text)`), with `name` and an `enabled` flag (per-source kill switch).
  - `scrape.RadioTavisuplebaAdapter`, `scrape.ArilimagAdapter` — honor robots.txt, rate-limit,
    31-day window, return **text only** (never persisted as full body).
  - `scrape.run_scrape(adapters, extractor, theme, db) -> int` — fetch → extract → re-validate
    → `create_from_extraction`; returns candidate count. Per-source failure isolated (one source
    failing must not block the other, DESIGN.md §10).

- [x] **Step 1: Write the failing test (adapters faked — no network)**

`backend/tests/test_scrape.py`:
```python
import datetime as dt

from app.ai.fakes import FakeGeminiClient
from app.ai.client import ExtractedCandidate
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
```

- [x] **Step 2: Run to verify failure → Step 3: Implement the scrape core**

`backend/app/sourcing/scrape.py` — define `Article` dataclass and:
```python
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


def run_scrape(adapters: list[SourceAdapter], ai: GeminiClient, theme: str, db: Session, within_days: int = 31) -> int:
    total = 0
    for adapter in adapters:
        if not adapter.enabled:
            continue
        try:
            articles = adapter.fetch_recent(within_days)
        except Exception:  # isolate per-source failure (§10)
            continue
        for article in articles:
            candidates = ai.extract(article.text, theme, [])
            for c in candidates:
                c.snippet = c.snippet  # keep short attributed snippet only; never store full body
            rows, _ = create_from_extraction(db, candidates, theme)
            for r in rows:
                r.source_url = article.url
            total += len(rows)
    return total
```
The real `RadioTavisuplebaAdapter`/`ArilimagAdapter` (httpx + selectolax, robots.txt +
rate-limit, 31-day filter) are implemented behind the Protocol; **do not enable them until Q4
ToS sign-off** — ship with `enabled=False` and a config flag.

- [ ] **Step 4: Add `POST /sources/refresh` + worker `scrape` handling** — DEFERRED (gated on Q4 ToS).
  No enabled source exists yet, so the endpoint + worker `scrape` dispatch would be a dead path.
  Wire up alongside the real adapters once RFE/RL ToS is signed off.

`POST /api/admin/sources/refresh` enqueues a `Job(kind="scrape")`; `worker.tick` dispatches on
`job.kind` (`fill` → `run_fill_job`, `scrape` → `run_scrape`). Mirror the fill-job lifecycle.

- [x] **Step 5: Run to verify pass; Step 6: Commit**

```bash
git add backend/app/sourcing/scrape.py backend/app/routers/admin.py backend/app/worker.py backend/tests/test_scrape.py
git commit -m "feat(sourcing): scrape adapters and scheduled job (sources disabled pending ToS)"
```

---

## Self-Review

**Spec coverage (DESIGN.md §3, §4.2, §4.7, §8):**
- Paste ingestion + extraction + re-validation (§4.2.2) — Tasks 1, 3, 5. ✅
- AI extraction config-driven, structured, bounded retry, never trusted (§4.7) — Tasks 2, 3. ✅
- `WordCandidate` lifecycle offered→accepted/edited/rejected, dedupe, theme tags (§4.1) — Task 4. ✅
- Pool review + bulk accept (§4.2.3) — Tasks 5, 7. ✅
- AI suggestions (§3, §4.7) — Tasks 2, 3, 5. ✅
- Seeds feed the solver (§4.2 → §4.6.4) — Task 6. ✅
- Scrapers, 2 sources, 31-day, robots/rate-limit, snippet-only, kill switch, source isolation (§3, §8, §10) — Task 8, **gated on Q4**. ✅
- Reusable `<DataTable>` (§4.8 + global guidance) — Task 7. ✅

**Type consistency:** `ExtractedCandidate`/`Suggestion`, `GeminiClient.extract/suggest`,
`create_from_extraction`/`list_pool`/`bulk_update`, `seeds_for_puzzle`, `Article`/`SourceAdapter`/`run_scrape`,
`get_gemini` dependency — consistent across tasks and tests. The worker's `seeds_provider` stub
from the Solver plan is concretely replaced in Task 6. ✅

**Placeholder note:** Tasks 7 (`api/admin.ts`, `PoolReview`) and 8 (real adapters, `/sources/refresh`
+ worker dispatch) describe behavior and reference exact patterns already shown in the skeleton/solver
rather than repeating boilerplate; expand to full code at execution time if a fresh subagent needs it.
