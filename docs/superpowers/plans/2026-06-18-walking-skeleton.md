# Zigzagi Walking Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a thin end-to-end slice — a hand-authored puzzle stored in Postgres, published by date, served to a React Play view that renders it and runs server-side check/reveal — so every integration seam in DESIGN.md is exercised before any subsystem machinery is built.

**Architecture:** A modular-monolith FastAPI backend (Play API + service layer + SQLAlchemy models on Postgres) and a Vite/React/TypeScript frontend whose crossword-solving logic lives in a **pure, framework-agnostic engine module** (DESIGN.md §4.8) consumed by React components. Answers never ship to the client; correctness is decided by server-side `check`/`reveal` endpoints (DESIGN.md §6.6 / §9). This is the "walking skeleton" — it proves the contracts in §4.3 and §4.4, not the solver, AI, or sourcing pipelines.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0 (sync), Alembic, psycopg 3, Postgres 16 (docker-compose), pytest; Node 20, Vite, React 18, TypeScript, Vitest, React Testing Library. Dependency manager: `uv` (backend), `npm` (frontend).

## Global Constraints

- **Grid size is data-driven, not hard-coded.** Production puzzles are 13×13 (DESIGN.md §3); this skeleton seeds a legible **5×5** fixture. No code may assume a fixed size — read `rows`/`cols` from the puzzle.
- **Georgian alphabet only for answers:** letters are U+10D0–U+10FF, one code point each (`len()` counts letters correctly).
- **Answers are NEVER included in any Play response** (DESIGN.md §4.5, §6.6, §9). The only ways a client learns a letter are: a `reveal` call (explicit) or a `check` call returning a boolean. Grep the `today` response shape for the substring `answer` — it must not appear.
- **`Puzzle.status` ∈ `draft | scheduled | published`**; a partial unique index enforces **one `scheduled`/`published` puzzle per `live_date`** (DESIGN.md §4.5).
- **TDD throughout:** write the failing test, watch it fail, write minimal code, watch it pass, commit. Frequent small commits.
- **Daily-publish timezone is `Asia/Tbilisi`** (DESIGN.md Open Q3, assumed). All "today" computations use it.

## What this skeleton deliberately omits (YAGNI)

No solver, no AI/Gemini, no scraping, no admin UI, no auth, no worker process, no WebGL background. Those are separate plans. Publishing here is a callable service function (`promote_due_puzzles`) the future worker will invoke — not a scheduler.

## Forward-compatibility notes (seams later plans rely on)

This is the foundation every other plan builds on (see `ROADMAP.md`). Keep these contracts
stable so later plans append rather than rewrite:

- **`grid_template` jsonb shape** = `{rows, cols, blocks: [[r,c]], cells: [{row,col,number}]}`.
  The Solver plan emits exactly this shape for 13×13 grids — so anything reading it (the `today`
  DTO, `<Grid>`) must stay size-agnostic.
- **Answers-withheld DTO + check/reveal request/response shapes** (Tasks 4–5) are frozen
  contracts: the full Play View plan reuses `checkCells`/`revealCells` for square/word/puzzle
  scopes, and the engine's `getFills()` (`{"r,c": letter}`) is the shape the Auth plan's
  `Progress.fills` merges. Do not rename these.
- **`schedule_puzzle` / `promote_due_puzzles`** (Task 6) are the publish seam. The Clues plan
  later inserts a `can_publish` guard inside `schedule_puzzle`; when that lands, this plan's
  `test_schedule_sets_status_and_date` must give its puzzle accepted-clue entries (flagged in the
  Clues plan, Task 3). Until then, the skeleton's no-entry schedule is correct.
- **The admin router does not exist yet.** It is created by the Solver plan (`app/routers/admin.py`,
  the first admin consumer); Sourcing/Clues/Publishing **append** to it, and the Auth plan adds the
  `require_admin` gate in one place. This is why the Solver plan precedes Sourcing in `ROADMAP.md`.
- **The worker process** is introduced by the Solver plan; this skeleton only ships the callable
  `promote_due_puzzles` it will eventually call on a daily tick (Publishing plan, Task 3).

## File Structure

```
zigzagi/
├── docker-compose.yml                 # Postgres 16 for dev + tests
├── backend/
│   ├── pyproject.toml                 # uv project, deps, pytest config
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                    # FastAPI app, router wiring, /api/health
│   │   ├── db.py                      # engine, SessionLocal, get_db dependency, Base
│   │   ├── models.py                  # Puzzle, Entry ORM models + partial unique index
│   │   ├── schemas.py                 # Pydantic request/response models
│   │   ├── seed.py                    # seed_demo_puzzle(): the 5×5 fixture
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── puzzles.py             # answer map, play DTO, today lookup
│   │   │   └── publish.py             # schedule_puzzle, promote_due_puzzles
│   │   └── routers/
│   │       ├── __init__.py
│   │       └── play.py                # /api/play/* endpoints
│   ├── alembic/                       # migrations (dev/prod); tests use create_all
│   │   ├── env.py
│   │   └── versions/
│   ├── alembic.ini
│   └── tests/
│       ├── conftest.py                # db engine + session + TestClient fixtures
│       ├── test_health.py
│       ├── test_models.py
│       ├── test_seed.py
│       ├── test_play_today.py
│       ├── test_play_check.py
│       ├── test_play_reveal.py
│       └── test_publish.py
└── frontend/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts                 # Vite + Vitest config
    ├── vitest.setup.ts                # RTL jest-dom matchers
    ├── index.html
    └── src/
        ├── main.tsx                   # React entry
        ├── engine/
        │   ├── types.ts               # PuzzleData, Cell, Direction, CellStatus…
        │   ├── crossword.ts           # CrosswordEngine (pure, no React)
        │   └── crossword.test.ts      # Vitest unit tests
        ├── api/
        │   └── play.ts                # fetchToday, checkCells, revealCells
        ├── components/
        │   ├── Grid.tsx               # renders engine state
        │   ├── Grid.test.tsx
        │   ├── PlayView.tsx           # wires API → engine → Grid
        │   └── PlayView.test.tsx
```

**Responsibilities:** `models.py` owns persistence + the one-per-date invariant; `services/` owns pure domain logic (answer map, DTO shaping, publish transitions) with no HTTP knowledge so it's unit-testable; `routers/play.py` is a thin HTTP adapter; `engine/crossword.ts` owns all solving state independent of React so the UI is a thin renderer.

---

### Task 1: Backend skeleton + Postgres + health check

**Files:**
- Create: `docker-compose.yml`
- Create: `backend/pyproject.toml`
- Create: `backend/app/__init__.py`, `backend/app/db.py`, `backend/app/main.py`
- Create: `backend/tests/conftest.py`, `backend/tests/test_health.py`

**Interfaces:**
- Produces: `app.main:app` (FastAPI instance); `app.db:Base` (declarative base), `app.db:get_db` (FastAPI dependency yielding a `Session`), `app.db:SessionLocal`. Tests consume the `client` and `db_session` fixtures from `conftest.py`.

- [x] **Step 1: Create the Postgres service**

`docker-compose.yml`:
```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: zigzagi
      POSTGRES_PASSWORD: zigzagi
      POSTGRES_DB: zigzagi
    ports:
      - "5432:5432"
```

Run: `docker compose up -d db`
Expected: `Container zigzagi-db-1  Started`

- [x] **Step 2: Initialize the backend project**

`backend/pyproject.toml`:
```toml
[project]
name = "zigzagi-backend"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.111",
    "uvicorn[standard]>=0.30",
    "sqlalchemy>=2.0",
    "psycopg[binary]>=3.1",
    "alembic>=1.13",
    "pydantic>=2.7",
]

[dependency-groups]
dev = ["pytest>=8.2", "httpx>=0.27"]

[tool.pytest.ini_options]
pythonpath = ["."]
testpaths = ["tests"]
```

Run (from `backend/`): `uv sync`
Expected: a `.venv` is created and dependencies resolve without error.

- [x] **Step 3: Write the database wiring**

`backend/app/__init__.py`: (empty file)

`backend/app/db.py`:
```python
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql+psycopg://zigzagi:zigzagi@localhost:5432/zigzagi"
)

engine = create_engine(DATABASE_URL, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [x] **Step 4: Write the failing health test**

`backend/tests/test_health.py`:
```python
def test_health_returns_ok(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

`backend/tests/conftest.py`:
```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base, get_db
from app.main import app
import app.models  # noqa: F401  ensure models are registered on Base

TEST_DATABASE_URL = "postgresql+psycopg://zigzagi:zigzagi@localhost:5432/zigzagi_test"


@pytest.fixture(scope="session")
def engine():
    eng = create_engine(TEST_DATABASE_URL, future=True)
    Base.metadata.drop_all(eng)
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)


@pytest.fixture
def db_session(engine):
    connection = engine.connect()
    transaction = connection.begin()
    Session = sessionmaker(bind=connection, expire_on_commit=False)
    session = Session()
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(db_session):
    app.dependency_overrides[get_db] = lambda: db_session
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

Note: `conftest.py` imports `app.models`, created in Task 2. Create an empty `backend/app/models.py` now so the import resolves:
```python
from app.db import Base  # noqa: F401
```

Create the test database once:
Run: `docker compose exec db createdb -U zigzagi zigzagi_test`
Expected: no output (success). If it already exists, that's fine.

- [x] **Step 5: Run the test to verify it fails**

Run (from `backend/`): `uv run pytest tests/test_health.py -v`
Expected: FAIL — `ImportError` / `app.main` has no `app`, or 404 on `/api/health`.

- [x] **Step 6: Write the minimal app**

`backend/app/main.py`:
```python
from fastapi import FastAPI

app = FastAPI(title="Zigzagi")


@app.get("/api/health")
def health():
    return {"status": "ok"}
```

- [x] **Step 7: Run the test to verify it passes**

Run (from `backend/`): `uv run pytest tests/test_health.py -v`
Expected: PASS — `1 passed`.

- [x] **Step 8: Commit**

```bash
git add docker-compose.yml backend/
git commit -m "feat: backend skeleton with postgres and health check"
```

---

### Task 2: Puzzle & Entry models + one-per-date invariant

**Files:**
- Modify: `backend/app/models.py` (replace the placeholder)
- Test: `backend/tests/test_models.py`

**Interfaces:**
- Consumes: `app.db:Base`.
- Produces:
  - `Puzzle(id: UUID, live_date: date, theme: str, grid_template: dict, status: str, seed: int|None, version: int, entries: list[Entry])`
  - `Entry(id: UUID, puzzle_id: UUID, number: int, direction: str, answer: str, row: int, col: int, clue: str|None, clue_status: str, provenance: str, puzzle: Puzzle)`
  - Partial unique index `uq_puzzle_live_date_active` on `live_date` where `status IN ('scheduled','published')`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_models.py`:
```python
import datetime as dt
import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Entry, Puzzle


def _puzzle(status="published", live_date=dt.date(2026, 6, 18)):
    return Puzzle(
        id=uuid.uuid4(),
        live_date=live_date,
        theme="თბილისი",
        grid_template={"rows": 5, "cols": 5, "blocks": [], "cells": []},
        status=status,
        seed=None,
        version=1,
    )


def test_puzzle_with_entries_persists(db_session):
    p = _puzzle()
    p.entries.append(
        Entry(
            id=uuid.uuid4(), number=1, direction="across", answer="აბგდე",
            row=0, col=0, clue="clue", clue_status="accepted", provenance="sourced",
        )
    )
    db_session.add(p)
    db_session.flush()
    loaded = db_session.get(Puzzle, p.id)
    assert len(loaded.entries) == 1
    assert loaded.entries[0].answer == "აბგდე"


def test_two_active_puzzles_same_date_rejected(db_session):
    db_session.add(_puzzle(status="published"))
    db_session.flush()
    db_session.add(_puzzle(status="scheduled"))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_two_active_puzzles_different_dates_ok(db_session):
    db_session.add(_puzzle(live_date=dt.date(2026, 6, 18)))
    db_session.add(_puzzle(live_date=dt.date(2026, 6, 19)))
    db_session.flush()  # no error


def test_draft_does_not_collide_with_active(db_session):
    db_session.add(_puzzle(status="published"))
    db_session.add(_puzzle(status="draft"))
    db_session.flush()  # drafts are exempt from the partial index
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `uv run pytest tests/test_models.py -v`
Expected: FAIL — `ImportError: cannot import name 'Entry'`.

- [ ] **Step 3: Write the models**

`backend/app/models.py` (replace entire file):
```python
import datetime as dt
import uuid

from sqlalchemy import ForeignKey, Index, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Puzzle(Base):
    __tablename__ = "puzzles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    live_date: Mapped[dt.date] = mapped_column()
    theme: Mapped[str] = mapped_column()
    grid_template: Mapped[dict] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(default="draft")
    seed: Mapped[int | None] = mapped_column(nullable=True)
    version: Mapped[int] = mapped_column(default=1)

    entries: Mapped[list["Entry"]] = relationship(
        back_populates="puzzle", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index(
            "uq_puzzle_live_date_active",
            "live_date",
            unique=True,
            postgresql_where=text("status IN ('scheduled', 'published')"),
        ),
    )


class Entry(Base):
    __tablename__ = "entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    puzzle_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("puzzles.id"))
    number: Mapped[int] = mapped_column()
    direction: Mapped[str] = mapped_column()  # "across" | "down"
    answer: Mapped[str] = mapped_column()
    row: Mapped[int] = mapped_column()
    col: Mapped[int] = mapped_column()
    clue: Mapped[str | None] = mapped_column(nullable=True)
    clue_status: Mapped[str] = mapped_column(default="pending")
    provenance: Mapped[str] = mapped_column(default="general-fill")

    puzzle: Mapped["Puzzle"] = relationship(back_populates="entries")
```

Because `conftest.py`'s session-scoped `engine` fixture runs `create_all` once, drop and recreate the test schema so the new tables exist:
Run: `docker compose exec db psql -U zigzagi -d zigzagi_test -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"`
Expected: `CREATE SCHEMA`.

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `backend/`): `uv run pytest tests/test_models.py -v`
Expected: PASS — `4 passed`.

- [ ] **Step 5: Generate the Alembic baseline migration**

Initialize Alembic and point it at `Base.metadata` (dev/prod migrations; tests keep using `create_all`).

`backend/alembic.ini` — set `sqlalchemy.url = postgresql+psycopg://zigzagi:zigzagi@localhost:5432/zigzagi`.

In `backend/alembic/env.py`, set `target_metadata`:
```python
from app.db import Base
import app.models  # noqa: F401
target_metadata = Base.metadata
```

Run (from `backend/`):
```bash
uv run alembic init -t generic alembic   # only if alembic/ does not yet exist
uv run alembic revision --autogenerate -m "puzzles and entries"
uv run alembic upgrade head
```
Expected: a new file under `alembic/versions/`, and `upgrade head` runs without error. Confirm the partial index is present:
Run: `docker compose exec db psql -U zigzagi -d zigzagi -c "\d puzzles"`
Expected: lists `uq_puzzle_live_date_active` as a partial unique index.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models.py backend/tests/test_models.py backend/alembic* 
git commit -m "feat: puzzle and entry models with one-per-date invariant"
```

---

### Task 3: Seed the hand-authored 5×5 fixture

**Files:**
- Create: `backend/app/seed.py`
- Test: `backend/tests/test_seed.py`

**Interfaces:**
- Consumes: `Puzzle`, `Entry`, a `Session`.
- Produces: `seed_demo_puzzle(db: Session, live_date: date, status: str = "published") -> Puzzle`. The fixture is a full (no-block) 5×5 grid whose row-letters and column-letters are consistent by construction. Numbered cells and entries are exactly those listed below — later tasks rely on these numbers.

The fixture letter matrix (row-major):
```
ა ბ გ დ ე
ვ ზ თ ი კ
ლ მ ნ ო პ
ჟ რ ს ტ უ
ფ ქ ღ ყ შ
```
Across answers (one per row) and Down answers (one per column) are derived from it; intersections agree automatically. Clue text is placeholder Georgian — this is a fixture, not real content.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_seed.py`:
```python
import datetime as dt

from app.seed import seed_demo_puzzle


def test_seed_creates_one_published_puzzle(db_session):
    p = seed_demo_puzzle(db_session, live_date=dt.date(2026, 6, 18))
    db_session.flush()
    assert p.status == "published"
    assert p.grid_template["rows"] == 5
    assert p.grid_template["cols"] == 5
    # 5 across + 5 down entries
    assert len(p.entries) == 10
    assert sum(1 for e in p.entries if e.direction == "across") == 5
    assert sum(1 for e in p.entries if e.direction == "down") == 5


def test_seed_entries_are_consistent_at_intersections(db_session):
    p = seed_demo_puzzle(db_session, live_date=dt.date(2026, 6, 18))
    # Build a cell->letter map from every entry; conflicting writes would mean
    # an inconsistent fixture.
    cell = {}
    for e in p.entries:
        r, c = e.row, e.col
        for ch in e.answer:
            if (r, c) in cell:
                assert cell[(r, c)] == ch, f"conflict at {(r, c)}"
            cell[(r, c)] = ch
            if e.direction == "across":
                c += 1
            else:
                r += 1
    assert len(cell) == 25  # full 5×5 grid covered
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `backend/`): `uv run pytest tests/test_seed.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.seed'`.

- [ ] **Step 3: Write the seed function**

`backend/app/seed.py`:
```python
import datetime as dt
import uuid

from sqlalchemy.orm import Session

from app.models import Entry, Puzzle

# Row-major 5×5 letter matrix; rows are Across answers, columns are Down answers.
_MATRIX = [
    "აბგდე",
    "ვზთიკ",
    "ლმნოპ",
    "ჟრსტუ",
    "ფქღყშ",
]

# (number, direction, row, col) for each entry. Across = a full row, Down = a full column.
_ENTRIES = [
    (1, "across", 0, 0), (6, "across", 1, 0), (7, "across", 2, 0),
    (8, "across", 3, 0), (9, "across", 4, 0),
    (1, "down", 0, 0), (2, "down", 0, 1), (3, "down", 0, 2),
    (4, "down", 0, 3), (5, "down", 0, 4),
]

# Cells that carry a clue number (cells.* in the Play contract, DESIGN.md §4.4).
_NUMBERED_CELLS = [
    {"row": 0, "col": 0, "number": 1},
    {"row": 0, "col": 1, "number": 2},
    {"row": 0, "col": 2, "number": 3},
    {"row": 0, "col": 3, "number": 4},
    {"row": 0, "col": 4, "number": 5},
    {"row": 1, "col": 0, "number": 6},
    {"row": 2, "col": 0, "number": 7},
    {"row": 3, "col": 0, "number": 8},
    {"row": 4, "col": 0, "number": 9},
]


def _answer_for(direction: str, row: int, col: int) -> str:
    if direction == "across":
        return _MATRIX[row]
    return "".join(_MATRIX[r][col] for r in range(5))


def seed_demo_puzzle(db: Session, live_date: dt.date, status: str = "published") -> Puzzle:
    puzzle = Puzzle(
        id=uuid.uuid4(),
        live_date=live_date,
        theme="დემო",
        grid_template={"rows": 5, "cols": 5, "blocks": [], "cells": _NUMBERED_CELLS},
        status=status,
        seed=None,
        version=1,
    )
    for number, direction, row, col in _ENTRIES:
        puzzle.entries.append(
            Entry(
                id=uuid.uuid4(),
                number=number,
                direction=direction,
                answer=_answer_for(direction, row, col),
                row=row,
                col=col,
                clue=f"მინიშნება {number} {direction}",
                clue_status="accepted",
                provenance="sourced",
            )
        )
    db.add(puzzle)
    return puzzle
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `backend/`): `uv run pytest tests/test_seed.py -v`
Expected: PASS — `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/seed.py backend/tests/test_seed.py
git commit -m "feat: seed hand-authored 5x5 demo puzzle"
```

---

### Task 4: `GET /api/play/puzzles/today` (answers withheld)

**Files:**
- Create: `backend/app/services/__init__.py`, `backend/app/services/puzzles.py`
- Create: `backend/app/schemas.py`
- Create: `backend/app/routers/__init__.py`, `backend/app/routers/play.py`
- Modify: `backend/app/main.py` (wire the router)
- Test: `backend/tests/test_play_today.py`

**Interfaces:**
- Consumes: `Puzzle`, `Entry`, `get_db`, `seed_demo_puzzle`.
- Produces:
  - `services.puzzles:get_published_puzzle(db, on_date: date) -> Puzzle | None`
  - `services.puzzles:to_play_dto(puzzle: Puzzle) -> dict` — shape exactly per DESIGN.md §4.4 (`date, theme, size, blocks, cells, clues`), **no `answer` key anywhere**.
  - `services.puzzles:today_tbilisi() -> date`
  - Route `GET /api/play/puzzles/today` → 200 with the DTO, or 404 `{"detail": "no puzzle for today"}`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_play_today.py`:
```python
import datetime as dt
import json

from app.seed import seed_demo_puzzle
import app.services.puzzles as puzzles_service


def _force_today(monkeypatch, day):
    monkeypatch.setattr(puzzles_service, "today_tbilisi", lambda: day)


def test_today_returns_structure_without_answers(client, db_session, monkeypatch):
    today = dt.date(2026, 6, 18)
    seed_demo_puzzle(db_session, live_date=today)
    db_session.flush()
    _force_today(monkeypatch, today)

    response = client.get("/api/play/puzzles/today")
    assert response.status_code == 200
    body = response.json()

    assert body["date"] == "2026-06-18"
    assert body["size"] == {"rows": 5, "cols": 5}
    assert len(body["clues"]["across"]) == 5
    assert len(body["clues"]["down"]) == 5
    # Clues carry text + length but NEVER the answer string.
    assert "answer" not in json.dumps(body)
    first = body["clues"]["across"][0]
    assert first["number"] == 1 and first["length"] == 5 and first["cell"] == [0, 0]


def test_today_404_when_none_published(client, db_session, monkeypatch):
    _force_today(monkeypatch, dt.date(2099, 1, 1))
    response = client.get("/api/play/puzzles/today")
    assert response.status_code == 404
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `backend/`): `uv run pytest tests/test_play_today.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.puzzles'`.

- [ ] **Step 3: Write the service**

`backend/app/services/__init__.py`: (empty file)

`backend/app/services/puzzles.py`:
```python
import datetime as dt
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Puzzle

_TBILISI = ZoneInfo("Asia/Tbilisi")


def today_tbilisi() -> dt.date:
    return dt.datetime.now(_TBILISI).date()


def get_published_puzzle(db: Session, on_date: dt.date) -> Puzzle | None:
    stmt = select(Puzzle).where(
        Puzzle.live_date == on_date, Puzzle.status == "published"
    )
    return db.scalars(stmt).first()


def to_play_dto(puzzle: Puzzle) -> dict:
    across, down = [], []
    for e in puzzle.entries:
        ref = {
            "number": e.number,
            "cell": [e.row, e.col],
            "length": len(e.answer),
            "text": e.clue,
        }
        (across if e.direction == "across" else down).append(ref)
    across.sort(key=lambda r: r["number"])
    down.sort(key=lambda r: r["number"])
    gt = puzzle.grid_template
    return {
        "date": puzzle.live_date.isoformat(),
        "theme": puzzle.theme,
        "size": {"rows": gt["rows"], "cols": gt["cols"]},
        "blocks": gt["blocks"],
        "cells": gt["cells"],
        "clues": {"across": across, "down": down},
    }
```

- [ ] **Step 4: Write the router and wire it**

`backend/app/routers/__init__.py`: (empty file)

`backend/app/routers/play.py`:
```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.services import puzzles as svc

router = APIRouter(prefix="/api/play", tags=["play"])


@router.get("/puzzles/today")
def get_today(db: Session = Depends(get_db)):
    puzzle = svc.get_published_puzzle(db, svc.today_tbilisi())
    if puzzle is None:
        raise HTTPException(status_code=404, detail="no puzzle for today")
    return svc.to_play_dto(puzzle)
```

`backend/app/main.py` (add the import and `include_router`):
```python
from fastapi import FastAPI

from app.routers import play

app = FastAPI(title="Zigzagi")
app.include_router(play.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
```

(`schemas.py` is created in Task 5; no need yet.)

- [ ] **Step 5: Run the test to verify it passes**

Run (from `backend/`): `uv run pytest tests/test_play_today.py -v`
Expected: PASS — `2 passed`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services backend/app/routers backend/app/main.py backend/tests/test_play_today.py
git commit -m "feat: GET play today endpoint with answers withheld"
```

---

### Task 5: `POST /api/play/puzzles/{date}/check` and `/reveal`

**Files:**
- Create: `backend/app/schemas.py`
- Modify: `backend/app/services/puzzles.py` (add `build_answer_map`)
- Modify: `backend/app/routers/play.py` (add two routes)
- Test: `backend/tests/test_play_check.py`, `backend/tests/test_play_reveal.py`

**Interfaces:**
- Consumes: `get_published_puzzle`, `Puzzle`.
- Produces:
  - `services.puzzles:build_answer_map(puzzle) -> dict[tuple[int, int], str]` — `(row, col) -> letter`.
  - `POST /api/play/puzzles/{date}/check` — request `{"cells": [{"row", "col", "value"}]}` → `{"results": [{"row", "col", "correct"}]}`. **Never returns the correct letter for a wrong cell.**
  - `POST /api/play/puzzles/{date}/reveal` — request `{"cells": [{"row", "col"}]}` → `{"cells": [{"row", "col", "value"}]}`.
  - 404 if no published puzzle for `{date}`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_play_check.py`:
```python
import datetime as dt
import json

from app.seed import seed_demo_puzzle


def test_check_marks_cells_correct_and_incorrect(client, db_session):
    seed_demo_puzzle(db_session, live_date=dt.date(2026, 6, 18))
    db_session.flush()
    # (0,0) is "ა" in the fixture. Send one right, one wrong.
    payload = {"cells": [
        {"row": 0, "col": 0, "value": "ა"},
        {"row": 0, "col": 1, "value": " z"},
    ]}
    response = client.post("/api/play/puzzles/2026-06-18/check", json=payload)
    assert response.status_code == 200
    results = response.json()["results"]
    assert {"row": 0, "col": 0, "correct": True} in results
    assert {"row": 0, "col": 1, "correct": False} in results
    # The correct letter for the wrong cell ("ბ") must not leak.
    assert "ბ" not in json.dumps(response.json())


def test_check_404_for_missing_date(client, db_session):
    response = client.post(
        "/api/play/puzzles/2099-01-01/check", json={"cells": []}
    )
    assert response.status_code == 404
```

`backend/tests/test_play_reveal.py`:
```python
import datetime as dt

from app.seed import seed_demo_puzzle


def test_reveal_returns_correct_letters(client, db_session):
    seed_demo_puzzle(db_session, live_date=dt.date(2026, 6, 18))
    db_session.flush()
    payload = {"cells": [{"row": 0, "col": 0}, {"row": 1, "col": 0}]}
    response = client.post("/api/play/puzzles/2026-06-18/reveal", json=payload)
    assert response.status_code == 200
    cells = response.json()["cells"]
    assert {"row": 0, "col": 0, "value": "ა"} in cells
    assert {"row": 1, "col": 0, "value": "ვ"} in cells
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `uv run pytest tests/test_play_check.py tests/test_play_reveal.py -v`
Expected: FAIL — 404/405 (routes don't exist).

- [ ] **Step 3: Add the schemas**

`backend/app/schemas.py`:
```python
from pydantic import BaseModel


class CheckCell(BaseModel):
    row: int
    col: int
    value: str


class CheckRequest(BaseModel):
    cells: list[CheckCell]


class CellRef(BaseModel):
    row: int
    col: int


class RevealRequest(BaseModel):
    cells: list[CellRef]
```

- [ ] **Step 4: Add the answer-map helper**

Append to `backend/app/services/puzzles.py`:
```python
def build_answer_map(puzzle: Puzzle) -> dict[tuple[int, int], str]:
    amap: dict[tuple[int, int], str] = {}
    for e in puzzle.entries:
        r, c = e.row, e.col
        for ch in e.answer:
            amap[(r, c)] = ch
            if e.direction == "across":
                c += 1
            else:
                r += 1
    return amap
```

- [ ] **Step 5: Add the routes**

Append to `backend/app/routers/play.py` (and extend its imports):
```python
import datetime as dt

from app.schemas import CheckRequest, RevealRequest


def _require_puzzle(db, date_str: str):
    try:
        on_date = dt.date.fromisoformat(date_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid date")
    puzzle = svc.get_published_puzzle(db, on_date)
    if puzzle is None:
        raise HTTPException(status_code=404, detail="no puzzle for date")
    return puzzle


@router.post("/puzzles/{date}/check")
def check(date: str, payload: CheckRequest, db: Session = Depends(get_db)):
    puzzle = _require_puzzle(db, date)
    amap = svc.build_answer_map(puzzle)
    results = [
        {"row": c.row, "col": c.col, "correct": amap.get((c.row, c.col)) == c.value}
        for c in payload.cells
    ]
    return {"results": results}


@router.post("/puzzles/{date}/reveal")
def reveal(date: str, payload: RevealRequest, db: Session = Depends(get_db)):
    puzzle = _require_puzzle(db, date)
    amap = svc.build_answer_map(puzzle)
    cells = [
        {"row": c.row, "col": c.col, "value": amap[(c.row, c.col)]}
        for c in payload.cells
        if (c.row, c.col) in amap
    ]
    return {"cells": cells}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run (from `backend/`): `uv run pytest tests/test_play_check.py tests/test_play_reveal.py -v`
Expected: PASS — `3 passed`.

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas.py backend/app/services/puzzles.py backend/app/routers/play.py backend/tests/test_play_check.py backend/tests/test_play_reveal.py
git commit -m "feat: server-side check and reveal endpoints"
```

---

### Task 6: Publish service — schedule + promote-due

**Files:**
- Create: `backend/app/services/publish.py`
- Test: `backend/tests/test_publish.py`

**Interfaces:**
- Consumes: `Puzzle`, a `Session`.
- Produces:
  - `services.publish:schedule_puzzle(db, puzzle_id: UUID, live_date: date) -> Puzzle` — sets `status="scheduled"`, `live_date`.
  - `services.publish:promote_due_puzzles(db, on_date: date) -> int` — flips every `scheduled` puzzle with `live_date <= on_date` to `published`; returns the count. (The future worker calls this; the skeleton does not run a scheduler.)

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_publish.py`:
```python
import datetime as dt
import uuid

from app.models import Puzzle
from app.services.publish import promote_due_puzzles, schedule_puzzle


def _draft(db, live_date):
    p = Puzzle(
        id=uuid.uuid4(), live_date=live_date, theme="t",
        grid_template={"rows": 5, "cols": 5, "blocks": [], "cells": []},
        status="draft", seed=None, version=1,
    )
    db.add(p)
    db.flush()
    return p


def test_schedule_sets_status_and_date(db_session):
    p = _draft(db_session, dt.date(2026, 6, 20))
    schedule_puzzle(db_session, p.id, dt.date(2026, 6, 25))
    assert p.status == "scheduled"
    assert p.live_date == dt.date(2026, 6, 25)


def test_promote_publishes_only_due_scheduled(db_session):
    due = _draft(db_session, dt.date(2026, 6, 18))
    schedule_puzzle(db_session, due.id, dt.date(2026, 6, 18))
    future = _draft(db_session, dt.date(2026, 6, 30))
    schedule_puzzle(db_session, future.id, dt.date(2026, 6, 30))

    count = promote_due_puzzles(db_session, dt.date(2026, 6, 18))
    assert count == 1
    assert due.status == "published"
    assert future.status == "scheduled"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `backend/`): `uv run pytest tests/test_publish.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.publish'`.

- [ ] **Step 3: Write the publish service**

`backend/app/services/publish.py`:
```python
import datetime as dt
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Puzzle


def schedule_puzzle(db: Session, puzzle_id: uuid.UUID, live_date: dt.date) -> Puzzle:
    puzzle = db.get(Puzzle, puzzle_id)
    if puzzle is None:
        raise ValueError("puzzle not found")
    puzzle.live_date = live_date
    puzzle.status = "scheduled"
    db.flush()
    return puzzle


def promote_due_puzzles(db: Session, on_date: dt.date) -> int:
    stmt = select(Puzzle).where(
        Puzzle.status == "scheduled", Puzzle.live_date <= on_date
    )
    due = list(db.scalars(stmt))
    for puzzle in due:
        puzzle.status = "published"
    db.flush()
    return len(due)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `backend/`): `uv run pytest tests/test_publish.py -v`
Expected: PASS — `2 passed`.

- [ ] **Step 5: Run the full backend suite**

Run (from `backend/`): `uv run pytest -v`
Expected: PASS — all tests across all files green.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/publish.py backend/tests/test_publish.py
git commit -m "feat: publish service with schedule and promote-due"
```

---

### Task 7: Frontend skeleton + engine state (active cell, typing, navigation)

**Files:**
- Create: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/vitest.setup.ts`, `frontend/index.html`, `frontend/src/main.tsx`
- Create: `frontend/src/engine/types.ts`, `frontend/src/engine/crossword.ts`
- Test: `frontend/src/engine/crossword.test.ts`

**Interfaces:**
- Produces the **pure engine** (no React import):
  - Types in `engine/types.ts`: `Direction = "across" | "down"`; `Cell = {row, col}`; `NumberedCell = Cell & {number}`; `ClueRef = {number, cell: [number, number], length, text}`; `PuzzleData = {date, theme, size: {rows, cols}, blocks: [number, number][], cells: NumberedCell[], clues: {across: ClueRef[], down: ClueRef[]}}`; `CellStatus = "empty" | "filled" | "correct" | "incorrect" | "revealed"`.
  - `class CrosswordEngine`:
    - `constructor(puzzle: PuzzleData)`
    - `get size(): {rows, cols}`; `get active(): Cell`; `get direction(): Direction`
    - `isBlock(row, col): boolean`
    - `getValue(row, col): string`; `getStatus(row, col): CellStatus`
    - `setActive(row, col): void`; `toggleDirection(): void`
    - `type(letter: string): void` (write + auto-advance within current word)
    - `backspace(): void`
    - `move(dir: "up"|"down"|"left"|"right"): void`
    - `currentWordCells(): Cell[]`
    - `getFills(): Record<string, string>` (key `"r,c"`)
    - `applyCheck(results: {row, col, correct: boolean}[]): void`
    - `applyReveal(cells: {row, col, value: string}[]): void`
- Consumed by `Grid.tsx` (Task 9) and `PlayView.tsx` (Task 10).

- [ ] **Step 1: Scaffold the frontend project**

`frontend/package.json`:
```json
{
  "name": "zigzagi-frontend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^24.1.0",
    "typescript": "^5.5.0",
    "vite": "^5.3.0",
    "vitest": "^2.0.0"
  }
}
```

`frontend/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "skipLibCheck": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

`frontend/vite.config.ts`:
```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
  },
});
```

`frontend/vitest.setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";
```

`frontend/index.html`:
```html
<!doctype html>
<html lang="ka">
  <head><meta charset="UTF-8" /><title>Zigzagi</title></head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`frontend/src/main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { PlayView } from "./components/PlayView";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PlayView />
  </StrictMode>,
);
```
(`PlayView` is built in Task 10; `main.tsx` won't run until then, but tests don't import it.)

Run (from `frontend/`): `npm install`
Expected: dependencies install without error.

- [ ] **Step 2: Write the failing engine tests**

`frontend/src/engine/crossword.test.ts`:
```ts
import { describe, expect, it } from "vitest";

import { CrosswordEngine } from "./crossword";
import type { PuzzleData } from "./types";

const PUZZLE: PuzzleData = {
  date: "2026-06-18",
  theme: "დემო",
  size: { rows: 5, cols: 5 },
  blocks: [],
  cells: [
    { row: 0, col: 0, number: 1 },
    { row: 0, col: 1, number: 2 },
    { row: 1, col: 0, number: 6 },
  ],
  clues: {
    across: [{ number: 1, cell: [0, 0], length: 5, text: "1A" }],
    down: [{ number: 1, cell: [0, 0], length: 5, text: "1D" }],
  },
};

describe("CrosswordEngine", () => {
  it("starts at 0,0 going across", () => {
    const e = new CrosswordEngine(PUZZLE);
    expect(e.active).toEqual({ row: 0, col: 0 });
    expect(e.direction).toBe("across");
  });

  it("toggles direction", () => {
    const e = new CrosswordEngine(PUZZLE);
    e.toggleDirection();
    expect(e.direction).toBe("down");
  });

  it("typing writes a letter and auto-advances across", () => {
    const e = new CrosswordEngine(PUZZLE);
    e.type("ა");
    expect(e.getValue(0, 0)).toBe("ა");
    expect(e.active).toEqual({ row: 0, col: 1 });
  });

  it("does not advance past the last cell of the row", () => {
    const e = new CrosswordEngine(PUZZLE);
    e.setActive(0, 4);
    e.type("ე");
    expect(e.active).toEqual({ row: 0, col: 4 });
  });

  it("backspace clears and steps back", () => {
    const e = new CrosswordEngine(PUZZLE);
    e.type("ა"); // now at (0,1)
    e.backspace(); // clears (0,1) if empty -> steps to (0,0)? define: clear current, step back
    expect(e.active).toEqual({ row: 0, col: 0 });
  });

  it("currentWordCells returns the whole across row", () => {
    const e = new CrosswordEngine(PUZZLE);
    const cells = e.currentWordCells();
    expect(cells).toHaveLength(5);
    expect(cells[0]).toEqual({ row: 0, col: 0 });
    expect(cells[4]).toEqual({ row: 0, col: 4 });
  });

  it("getFills returns keyed letters", () => {
    const e = new CrosswordEngine(PUZZLE);
    e.type("ა");
    expect(e.getFills()).toEqual({ "0,0": "ა" });
  });

  it("move down changes the active row", () => {
    const e = new CrosswordEngine(PUZZLE);
    e.move("down");
    expect(e.active).toEqual({ row: 1, col: 0 });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run (from `frontend/`): `npm test -- crossword`
Expected: FAIL — cannot resolve `./crossword`.

- [ ] **Step 4: Write the types and engine**

`frontend/src/engine/types.ts`:
```ts
export type Direction = "across" | "down";

export interface Cell {
  row: number;
  col: number;
}

export interface NumberedCell extends Cell {
  number: number;
}

export interface ClueRef {
  number: number;
  cell: [number, number];
  length: number;
  text: string;
}

export interface PuzzleData {
  date: string;
  theme: string;
  size: { rows: number; cols: number };
  blocks: [number, number][];
  cells: NumberedCell[];
  clues: { across: ClueRef[]; down: ClueRef[] };
}

export type CellStatus = "empty" | "filled" | "correct" | "incorrect" | "revealed";
```

`frontend/src/engine/crossword.ts`:
```ts
import type { Cell, CellStatus, Direction, PuzzleData } from "./types";

const key = (row: number, col: number) => `${row},${col}`;

export class CrosswordEngine {
  private readonly puzzle: PuzzleData;
  private readonly blocks: Set<string>;
  private values: Record<string, string> = {};
  private statuses: Record<string, CellStatus> = {};
  private _active: Cell = { row: 0, col: 0 };
  private _direction: Direction = "across";

  constructor(puzzle: PuzzleData) {
    this.puzzle = puzzle;
    this.blocks = new Set(puzzle.blocks.map(([r, c]) => key(r, c)));
    // Start on the first non-block cell.
    outer: for (let r = 0; r < puzzle.size.rows; r++) {
      for (let c = 0; c < puzzle.size.cols; c++) {
        if (!this.isBlock(r, c)) {
          this._active = { row: r, col: c };
          break outer;
        }
      }
    }
  }

  get size() {
    return this.puzzle.size;
  }
  get active(): Cell {
    return this._active;
  }
  get direction(): Direction {
    return this._direction;
  }

  isBlock(row: number, col: number): boolean {
    return this.blocks.has(key(row, col));
  }

  private inBounds(row: number, col: number): boolean {
    return (
      row >= 0 &&
      col >= 0 &&
      row < this.puzzle.size.rows &&
      col < this.puzzle.size.cols
    );
  }

  private playable(row: number, col: number): boolean {
    return this.inBounds(row, col) && !this.isBlock(row, col);
  }

  getValue(row: number, col: number): string {
    return this.values[key(row, col)] ?? "";
  }

  getStatus(row: number, col: number): CellStatus {
    const explicit = this.statuses[key(row, col)];
    if (explicit) return explicit;
    return this.getValue(row, col) ? "filled" : "empty";
  }

  setActive(row: number, col: number): void {
    if (this.playable(row, col)) this._active = { row, col };
  }

  toggleDirection(): void {
    this._direction = this._direction === "across" ? "down" : "across";
  }

  private step(cell: Cell, delta: 1 | -1): Cell {
    return this._direction === "across"
      ? { row: cell.row, col: cell.col + delta }
      : { row: cell.row + delta, col: cell.col + delta * 0 + (delta === 1 ? 1 : -1) - 1 };
  }

  type(letter: string): void {
    const { row, col } = this._active;
    if (!this.playable(row, col)) return;
    this.values[key(row, col)] = letter;
    delete this.statuses[key(row, col)]; // typing clears prior correct/incorrect mark
    const next =
      this._direction === "across"
        ? { row, col: col + 1 }
        : { row: row + 1, col };
    if (this.playable(next.row, next.col)) this._active = next;
  }

  backspace(): void {
    const { row, col } = this._active;
    if (this.getValue(row, col)) {
      this.values[key(row, col)] = "";
      delete this.statuses[key(row, col)];
      return;
    }
    const prev =
      this._direction === "across"
        ? { row, col: col - 1 }
        : { row: row - 1, col };
    if (this.playable(prev.row, prev.col)) {
      this._active = prev;
      this.values[key(prev.row, prev.col)] = "";
      delete this.statuses[key(prev.row, prev.col)];
    }
  }

  move(dir: "up" | "down" | "left" | "right"): void {
    const deltas = {
      up: { row: -1, col: 0 },
      down: { row: 1, col: 0 },
      left: { row: 0, col: -1 },
      right: { row: 0, col: 1 },
    }[dir];
    const next = { row: this._active.row + deltas.row, col: this._active.col + deltas.col };
    if (this.playable(next.row, next.col)) this._active = next;
  }

  currentWordCells(): Cell[] {
    const cells: Cell[] = [];
    const stepRow = this._direction === "down" ? 1 : 0;
    const stepCol = this._direction === "across" ? 1 : 0;
    // Walk back to the word start.
    let { row, col } = this._active;
    while (this.playable(row - stepRow, col - stepCol)) {
      row -= stepRow;
      col -= stepCol;
    }
    // Walk forward to the word end.
    while (this.playable(row, col)) {
      cells.push({ row, col });
      row += stepRow;
      col += stepCol;
    }
    return cells;
  }

  getFills(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.values)) {
      if (v) out[k] = v;
    }
    return out;
  }

  applyCheck(results: { row: number; col: number; correct: boolean }[]): void {
    for (const r of results) {
      this.statuses[key(r.row, r.col)] = r.correct ? "correct" : "incorrect";
    }
  }

  applyReveal(cells: { row: number; col: number; value: string }[]): void {
    for (const c of cells) {
      this.values[key(c.row, c.col)] = c.value;
      this.statuses[key(c.row, c.col)] = "revealed";
    }
  }
}
```

Note: the `step` helper above is unused dead code — delete it. The `type`/`backspace` methods compute the next cell inline. (Kept the deletion explicit so the engine stays DRY.)

- [ ] **Step 5: Remove the dead `step` helper**

Delete the `private step(...)` method from `crossword.ts` (the inline next/prev computations replace it).

- [ ] **Step 6: Run the tests to verify they pass**

Run (from `frontend/`): `npm test -- crossword`
Expected: PASS — all `CrosswordEngine` tests green.

- [ ] **Step 7: Commit**

```bash
git add frontend/
git commit -m "feat: frontend scaffold and pure crossword engine"
```

---

### Task 8: Engine — apply check/reveal status (regression lock)

**Files:**
- Modify: `frontend/src/engine/crossword.test.ts` (add cases)

**Interfaces:**
- Consumes: `CrosswordEngine.applyCheck`, `applyReveal`, `getStatus`, `getValue` (already implemented in Task 7). This task locks their behavior with dedicated tests — no production code changes expected.

- [ ] **Step 1: Add the failing/locking tests**

Append to `frontend/src/engine/crossword.test.ts`:
```ts
describe("CrosswordEngine check/reveal", () => {
  it("applyCheck marks correct and incorrect", () => {
    const e = new CrosswordEngine(PUZZLE);
    e.setActive(0, 0);
    e.type("ა"); // (0,0) filled, active -> (0,1)
    e.applyCheck([
      { row: 0, col: 0, correct: true },
      { row: 0, col: 1, correct: false },
    ]);
    expect(e.getStatus(0, 0)).toBe("correct");
    expect(e.getStatus(0, 1)).toBe("incorrect");
  });

  it("applyReveal writes the value and marks revealed", () => {
    const e = new CrosswordEngine(PUZZLE);
    e.applyReveal([{ row: 0, col: 0, value: "ა" }]);
    expect(e.getValue(0, 0)).toBe("ა");
    expect(e.getStatus(0, 0)).toBe("revealed");
  });

  it("typing over a checked cell clears its status", () => {
    const e = new CrosswordEngine(PUZZLE);
    e.applyCheck([{ row: 0, col: 0, correct: false }]);
    e.setActive(0, 0);
    e.type("ბ");
    expect(e.getStatus(0, 0)).toBe("filled");
  });
});
```

- [ ] **Step 2: Run the tests**

Run (from `frontend/`): `npm test -- crossword`
Expected: PASS — the three new cases pass against the existing implementation. If any fail, fix `crossword.ts` minimally to satisfy them.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/engine/crossword.test.ts
git commit -m "test: lock engine check/reveal status behavior"
```

---

### Task 9: `<Grid>` component renders the engine

**Files:**
- Create: `frontend/src/components/Grid.tsx`
- Test: `frontend/src/components/Grid.test.tsx`

**Interfaces:**
- Consumes: `CrosswordEngine`, `PuzzleData`.
- Produces: `Grid({ engine, onCellClick }: { engine: CrosswordEngine; onCellClick: (row: number, col: number) => void })`. Renders a `rows×cols` grid; each non-block cell has `data-testid="cell-{row}-{col}"`, shows its value, shows its clue number if numbered, and gets `data-active="true"` when it is the engine's active cell. Block cells render `data-block="true"`.

- [ ] **Step 1: Write the failing test**

`frontend/src/components/Grid.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CrosswordEngine } from "../engine/crossword";
import type { PuzzleData } from "../engine/types";
import { Grid } from "./Grid";

const PUZZLE: PuzzleData = {
  date: "2026-06-18",
  theme: "დემო",
  size: { rows: 5, cols: 5 },
  blocks: [],
  cells: [{ row: 0, col: 0, number: 1 }],
  clues: { across: [], down: [] },
};

describe("Grid", () => {
  it("renders one cell per grid square", () => {
    render(<Grid engine={new CrosswordEngine(PUZZLE)} onCellClick={() => {}} />);
    expect(screen.getByTestId("cell-0-0")).toBeInTheDocument();
    expect(screen.getByTestId("cell-4-4")).toBeInTheDocument();
  });

  it("shows the clue number on numbered cells", () => {
    render(<Grid engine={new CrosswordEngine(PUZZLE)} onCellClick={() => {}} />);
    expect(screen.getByTestId("cell-0-0")).toHaveTextContent("1");
  });

  it("marks the active cell", () => {
    render(<Grid engine={new CrosswordEngine(PUZZLE)} onCellClick={() => {}} />);
    expect(screen.getByTestId("cell-0-0")).toHaveAttribute("data-active", "true");
  });

  it("calls onCellClick with coordinates", async () => {
    const onClick = vi.fn();
    render(<Grid engine={new CrosswordEngine(PUZZLE)} onCellClick={onClick} />);
    await userEvent.click(screen.getByTestId("cell-2-3"));
    expect(onClick).toHaveBeenCalledWith(2, 3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `frontend/`): `npm test -- Grid`
Expected: FAIL — cannot resolve `./Grid`.

- [ ] **Step 3: Write the component**

`frontend/src/components/Grid.tsx`:
```tsx
import type { CrosswordEngine } from "../engine/crossword";

interface GridProps {
  engine: CrosswordEngine;
  onCellClick: (row: number, col: number) => void;
}

function numberAt(engine: CrosswordEngine, puzzleCells: { row: number; col: number; number: number }[], row: number, col: number) {
  const match = puzzleCells.find((c) => c.row === row && c.col === col);
  return match?.number;
}

export function Grid({ engine, onCellClick }: GridProps) {
  const { rows, cols } = engine.size;
  // The numbered cells live on the engine's puzzle; expose them via a getter.
  const numbered = engine.numberedCells();
  const active = engine.active;

  return (
    <div
      role="grid"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 2rem)`,
        gap: "1px",
      }}
    >
      {Array.from({ length: rows }).flatMap((_, row) =>
        Array.from({ length: cols }).map((_, col) => {
          if (engine.isBlock(row, col)) {
            return <div key={`${row}-${col}`} data-block="true" style={{ width: "2rem", height: "2rem", background: "#222" }} />;
          }
          const isActive = active.row === row && active.col === col;
          const num = numberAt(engine, numbered, row, col);
          return (
            <button
              key={`${row}-${col}`}
              data-testid={`cell-${row}-${col}`}
              data-active={isActive ? "true" : "false"}
              data-status={engine.getStatus(row, col)}
              onClick={() => onCellClick(row, col)}
              style={{ width: "2rem", height: "2rem", position: "relative" }}
            >
              {num !== undefined && (
                <span style={{ position: "absolute", top: 0, left: 1, fontSize: "0.5rem" }}>{num}</span>
              )}
              {engine.getValue(row, col)}
            </button>
          );
        }),
      )}
    </div>
  );
}
```

This needs `engine.numberedCells()`. Add it to `CrosswordEngine` (Task 7 file):
```ts
numberedCells(): NumberedCell[] {
  return this.puzzle.cells;
}
```
(Import `NumberedCell` in `crossword.ts`'s type import.)

- [ ] **Step 4: Run the test to verify it passes**

Run (from `frontend/`): `npm test -- Grid`
Expected: PASS — all `Grid` tests green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/Grid.tsx frontend/src/components/Grid.test.tsx frontend/src/engine/crossword.ts
git commit -m "feat: Grid component rendering engine state"
```

---

### Task 10: `PlayView` — wire API → engine → Grid (end-to-end slice closes)

**Files:**
- Create: `frontend/src/api/play.ts`
- Create: `frontend/src/components/PlayView.tsx`
- Test: `frontend/src/components/PlayView.test.tsx`

**Interfaces:**
- Consumes: `fetchToday`, `checkCells`, `revealCells`, `CrosswordEngine`, `Grid`.
- Produces:
  - `api/play.ts`: `fetchToday(): Promise<PuzzleData>`; `checkCells(date, cells): Promise<{results}>`; `revealCells(date, cells): Promise<{cells}>` (thin `fetch` wrappers over the Task 4/5 endpoints).
  - `PlayView()`: on mount fetches today, builds an engine, renders `<Grid>`; a "Check" button posts the current word's fills and applies the result; a "Reveal" button reveals the active cell.

- [ ] **Step 1: Write the failing test (API mocked)**

`frontend/src/components/PlayView.test.tsx`:
```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PuzzleData } from "../engine/types";
import * as api from "../api/play";
import { PlayView } from "./PlayView";

const PUZZLE: PuzzleData = {
  date: "2026-06-18",
  theme: "დემო",
  size: { rows: 5, cols: 5 },
  blocks: [],
  cells: [{ row: 0, col: 0, number: 1 }],
  clues: {
    across: [{ number: 1, cell: [0, 0], length: 5, text: "1A" }],
    down: [{ number: 1, cell: [0, 0], length: 5, text: "1D" }],
  },
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "fetchToday").mockResolvedValue(PUZZLE);
});

describe("PlayView", () => {
  it("renders the grid from the API", async () => {
    render(<PlayView />);
    await waitFor(() => expect(screen.getByTestId("cell-0-0")).toBeInTheDocument());
  });

  it("checking applies server results to the grid", async () => {
    vi.spyOn(api, "checkCells").mockResolvedValue({
      results: [{ row: 0, col: 0, correct: true }],
    });
    render(<PlayView />);
    await waitFor(() => screen.getByTestId("cell-0-0"));

    await userEvent.click(screen.getByTestId("cell-0-0"));
    await userEvent.keyboard("ა");
    await userEvent.click(screen.getByRole("button", { name: /check/i }));

    await waitFor(() =>
      expect(screen.getByTestId("cell-0-0")).toHaveAttribute("data-status", "correct"),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `frontend/`): `npm test -- PlayView`
Expected: FAIL — cannot resolve `../api/play` / `./PlayView`.

- [ ] **Step 3: Write the API client**

`frontend/src/api/play.ts`:
```ts
import type { PuzzleData } from "../engine/types";

const BASE = "/api/play";

export async function fetchToday(): Promise<PuzzleData> {
  const res = await fetch(`${BASE}/puzzles/today`);
  if (!res.ok) throw new Error(`today failed: ${res.status}`);
  return res.json();
}

export async function checkCells(
  date: string,
  cells: { row: number; col: number; value: string }[],
): Promise<{ results: { row: number; col: number; correct: boolean }[] }> {
  const res = await fetch(`${BASE}/puzzles/${date}/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cells }),
  });
  if (!res.ok) throw new Error(`check failed: ${res.status}`);
  return res.json();
}

export async function revealCells(
  date: string,
  cells: { row: number; col: number }[],
): Promise<{ cells: { row: number; col: number; value: string }[] }> {
  const res = await fetch(`${BASE}/puzzles/${date}/reveal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cells }),
  });
  if (!res.ok) throw new Error(`reveal failed: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 4: Write the PlayView component**

`frontend/src/components/PlayView.tsx`:
```tsx
import { useEffect, useReducer, useState } from "react";

import { checkCells, fetchToday, revealCells } from "../api/play";
import { CrosswordEngine } from "../engine/crossword";
import type { PuzzleData } from "../engine/types";
import { Grid } from "./Grid";

export function PlayView() {
  const [engine, setEngine] = useState<CrosswordEngine | null>(null);
  const [puzzle, setPuzzle] = useState<PuzzleData | null>(null);
  // Engine is mutable; bump a counter to force re-render after each mutation.
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    fetchToday().then((p) => {
      setPuzzle(p);
      setEngine(new CrosswordEngine(p));
    });
  }, []);

  useEffect(() => {
    if (!engine) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Backspace") engine.backspace();
      else if (ev.key === "ArrowUp") engine.move("up");
      else if (ev.key === "ArrowDown") engine.move("down");
      else if (ev.key === "ArrowLeft") engine.move("left");
      else if (ev.key === "ArrowRight") engine.move("right");
      else if (ev.key.length === 1) engine.type(ev.key);
      else return;
      rerender();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine]);

  if (!engine || !puzzle) return <p>იტვირთება…</p>;

  const onCheck = async () => {
    const cells = engine
      .currentWordCells()
      .map((c) => ({ row: c.row, col: c.col, value: engine.getValue(c.row, c.col) }))
      .filter((c) => c.value);
    const { results } = await checkCells(puzzle.date, cells);
    engine.applyCheck(results);
    rerender();
  };

  const onReveal = async () => {
    const { row, col } = engine.active;
    const { cells } = await revealCells(puzzle.date, [{ row, col }]);
    engine.applyReveal(cells);
    rerender();
  };

  return (
    <div>
      <h1>{puzzle.theme}</h1>
      <Grid
        engine={engine}
        onCellClick={(row, col) => {
          engine.setActive(row, col);
          rerender();
        }}
      />
      <button onClick={onCheck}>Check</button>
      <button onClick={onReveal}>Reveal</button>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run (from `frontend/`): `npm test -- PlayView`
Expected: PASS — both `PlayView` tests green.

- [ ] **Step 6: Run the full frontend suite + typecheck**

Run (from `frontend/`): `npm test && npx tsc --noEmit`
Expected: all tests pass; `tsc` reports no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api frontend/src/components/PlayView.tsx frontend/src/components/PlayView.test.tsx
git commit -m "feat: PlayView wiring API to engine and grid"
```

---

### Task 11: Manual end-to-end smoke (the skeleton walks)

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Seed today's puzzle into the dev database**

Add a tiny CLI entry to `backend/app/seed.py`:
```python
if __name__ == "__main__":
    from app.db import SessionLocal
    from app.services.puzzles import today_tbilisi

    with SessionLocal() as db:
        seed_demo_puzzle(db, live_date=today_tbilisi())
        db.commit()
        print("seeded today's demo puzzle")
```

Run (from `backend/`): `uv run python -m app.seed`
Expected: `seeded today's demo puzzle`.

- [ ] **Step 2: Start the backend**

Run (from `backend/`): `uv run uvicorn app.main:app --reload`
Expected: Uvicorn serves on `http://127.0.0.1:8000`. Verify:
Run: `curl -s http://127.0.0.1:8000/api/play/puzzles/today`
Expected: JSON with `clues` and no `answer` substring.

- [ ] **Step 3: Start the frontend against the backend**

Add a dev proxy so `/api` reaches the backend. In `frontend/vite.config.ts`, add under `defineConfig`:
```ts
  server: { proxy: { "/api": "http://127.0.0.1:8000" } },
```

Run (from `frontend/`): `npm run dev`
Expected: Vite serves on `http://localhost:5173`.

- [ ] **Step 4: Walk the loop in the browser**

Open `http://localhost:5173`. Confirm: the 5×5 grid renders; clicking a cell activates it; typing Georgian letters fills and auto-advances; **Check** marks the current word's correct/incorrect cells; **Reveal** fills the active cell with the right letter. This exercises every seam: DB → published-by-date lookup → answers-withheld DTO → engine → Grid → server-side check/reveal.

- [ ] **Step 5: Commit the dev-proxy + seed CLI**

```bash
git add backend/app/seed.py frontend/vite.config.ts
git commit -m "chore: dev seed CLI and vite api proxy for e2e smoke"
```

---

## Self-Review

**Spec coverage (against the walking-skeleton scope + DESIGN.md seams):**
- DB + `Puzzle`/`Entry` models — Task 2. ✅
- One-published-per-date invariant (§4.5) — Task 2 (partial unique index) + Task 6 (transitions). ✅
- Seed a hand-authored puzzle — Task 3 + Task 11. ✅
- `GET /play/puzzles/today` with answers withheld (§4.3, §4.4, §6.6) — Task 4, asserted by `"answer" not in json.dumps(body)`. ✅
- Server-side check/reveal (§6.6, §9) — Task 5, with a no-leak assertion on check. ✅
- Pure framework-agnostic engine (§4.8) — Tasks 7–8, no React import in `crossword.ts`. ✅
- `<Grid>` renders it (§4.8 reusable components) — Task 9. ✅
- Publish-by-date promotion (worker entry point, §4.2 step 8) — Task 6. ✅
- `Asia/Tbilisi` today (Open Q3) — Task 4 `today_tbilisi`. ✅
- End-to-end proof — Task 11. ✅

**Out-of-scope confirmed absent:** no solver, AI, scraping, auth, admin UI, worker process, WebGL — all correctly deferred to later plans.

**Type consistency check:** `PuzzleData`/`CrosswordEngine` method names (`active`, `direction`, `setActive`, `toggleDirection`, `type`, `backspace`, `move`, `currentWordCells`, `getFills`, `getValue`, `getStatus`, `applyCheck`, `applyReveal`, `numberedCells`, `isBlock`, `size`) are used identically in Tasks 7, 9, 10. Backend `build_answer_map`, `get_published_puzzle`, `to_play_dto`, `today_tbilisi`, `schedule_puzzle`, `promote_due_puzzles` names match across Tasks 4–6 and their tests. Check/reveal request/response shapes match between `schemas.py`, `routers/play.py`, and `api/play.ts`. ✅

**Placeholder scan:** every code step contains complete code; the one intentional removal (the dead `step` helper) is called out explicitly in Task 7 Steps 4–5. ✅

**Note for the implementer:** `conftest.py`'s session-scoped `engine` fixture builds the schema via `create_all`. After Tasks 2 and 9 change models, the test DB schema is rebuilt automatically at the next test-session start because the fixture drops+creates; the manual `DROP SCHEMA` in Task 2 Step 3 is only needed if you run tests within an already-open session.
