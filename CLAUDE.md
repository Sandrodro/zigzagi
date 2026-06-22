# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Zigzagi is a Georgian-language daily crossword platform. Two surfaces: an **Admin Studio** (source text → word pool → solver fill → AI clues → publish) and a **Play** view (daily solve, NYT-like). The solver is pure-Python deterministic CSP; clue generation uses Gemini. See `DESIGN.md` for full architecture decisions and `PRD.md` for product scope.

## Running locally

```sh
# Start Postgres
docker compose up -d

# Start both backend + frontend together
./dev.sh

# Or separately:
cd backend && uv run uvicorn app.main:app --reload   # http://localhost:8000
cd frontend && npm run dev                            # http://localhost:5173
```

The frontend proxies `/api/*` to the backend via Vite config.

## Backend

**Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, psycopg3, `uv` for package management.

```sh
# Run all tests
cd backend && uv run pytest

# Run a single test file
cd backend && uv run pytest tests/test_play_check.py -v

# Run a single test by name
cd backend && uv run pytest tests/test_play_check.py::test_name -v

# Skip perf-marked tests (slow, need real wordlist)
cd backend && uv run pytest -m "not perf"

# Migrations
cd backend && uv run alembic revision --autogenerate -m "description"
cd backend && uv run alembic upgrade head
```

**Test DB:** `postgresql+psycopg://zigzagi:zigzagi@localhost:5432/zigzagi_test` — created/dropped per session in `tests/conftest.py`. Each test rolls back its transaction; no manual cleanup needed.

**Key layout:**
- `app/models.py` — all ORM models (`Puzzle`, `Entry`; solver plan adds `WordlistEntry`, `Job`)
- `app/db.py` — `Base`, `SessionLocal`, `get_db` dependency
- `app/routers/` — FastAPI routers; `play.py` exists, `admin.py` comes with the solver plan
- `app/services/` — business logic; `puzzles.py` (Play queries), `publish.py`
- `app/solver/` — pure-Python CSP solver (no SQLAlchemy/FastAPI imports inside this package)
- `app/services/solver_jobs.py` — the only place solver results meet the DB
- `app/worker.py` — long-running process; claims pending `Job` rows and runs fill

**DB creds (local):** `zigzagi/zigzagi` on `localhost:5432`, db `zigzagi`. Test db is `zigzagi_test`.

### Generating a puzzle

There is **no CLI generate verb**. Puzzles are created via the Admin HTTP API + the worker; the only entry points are `python -m app.worker` (real fill loop, polls pending `Job`s every 2s) and `python -m app.seed` (hard-coded 5×5 demo puzzle, not a real fill).

Flow: `POST /api/admin/puzzles` (draft) → load seed words (`POST /api/admin/extract` or pool accept) → `POST /api/admin/puzzles/{id}/fill {seed_value, min_seeds}` enqueues a fill `Job` → worker runs `fill()` and persists → `POST .../clues` → review → `POST .../schedule {live_date}` → worker publishes on the live date.

- **Templates are a curated library, not generated.** `app/solver/templates/*.json` (currently only `13x13-001`, `13x13-002`). Each is `{id, rows, cols, blocks:[[r,c]...]}`. `templates.py`: `load_library()`, `validate_template()` (symmetry, connectivity, **40–50 slots**), `pick_template(library, seed_value)` = `library[seed_value % len(library)]`.
- **Solver entry:** `app/solver/run.py::fill(template, seeds, wordlist, seed_value, min_seeds=15, deadline_s=10.0)` → constraints (`model.py`) → seed-slot pick (`seeds.py`) → length-indexed wordlist (`index.py`) → backtracking CSP MRV (`fill.py`, `order.py`). Persisted by `services/solver_jobs.py::persist_fill`.
- **Wordlist** lives in the `wordlist_entries` table (not a checked-in file); populated via `POST /api/admin/wordlist/bulk`. Validation (`services/wordlist.py`): Georgian-only, length 3–13.
- **Other sizes (e.g. 20×20):** the solver/CSP is size-agnostic, but you'd need to (1) add a template JSON of that size, (2) relax the hardcoded `40–50` slot range in `templates.py` and the `len > 13` word-length cap in `services/wordlist.py`. No size config exists today.

## Frontend

**Stack:** React 18, TypeScript, Vite, TanStack Query (react-query) for server state, TanStack Router (code-based route tree in `src/router.tsx`) for routing, Vitest + Testing Library (no Tailwind yet).

```sh
cd frontend && npm test          # vitest run
cd frontend && npm run build     # tsc + vite build
```

**Key layout:**
- `src/engine/crossword.ts` — pure, framework-agnostic solving engine (active cell, navigation, check/reveal state); unit-tested in isolation
- `src/engine/types.ts` — shared types
- **`src/pages/`** — full-screen views mounted by a route or the admin shell (`PlayView`, `PuzzleList`, `AdminApp`, and the admin tab screens `PoolReview`/`PuzzleBuilder`/`WordlistManager`). **`src/components/`** — reusable pieces pages compose (`Grid`, `ClueBar`, `ClueList`, `Timer`, `CongratsModal`, `Background`, `DataTable`, …). Pages import components via `../components/X`.
- `src/api/play.ts` — TanStack Query hooks for Play endpoints (`usePuzzle(date?)`, `usePuzzleList`, `useCheckCells`, `useRevealCells`); raw `fetch` wrappers are module-private. `QueryClientProvider` and `RouterProvider` are set up in `src/main.tsx` (the route tree lives in `src/router.tsx`); component tests must wrap renders in `QueryClientProvider`, and components using `<Link>` also need a (memory) router.
- Routes (`src/router.tsx`): `/` Play (today), `/play?date=` Play (a published puzzle by date), `/list` published-puzzle list, `/admin` admin shell.
- **Tests** live in a `__test__/` folder next to the code under test (e.g. `src/components/__test__/`, `src/pages/__test__/`). Component/page tests mock `fetch` (via `vi.stubGlobal`) rather than the api module.
- The project is **TypeScript-only** (`.ts`/`.tsx`); `tsc` runs with `noEmit` (Vite transpiles), so no `.js` artifacts in `src/`.

## Architecture invariants

- **Answers never leave the server.** The Play API returns grid structure + clues only. Check/reveal are server-side endpoints.
- **Solver is pure.** `app/solver/` has zero FastAPI or SQLAlchemy imports — it's a pure function `fill(template, seeds, wordlist, seed_value) -> FillResult | FillFailure`.
- **Fill runs async.** Solver fill is enqueued as a `Job` row and processed by the worker; HTTP only enqueues and polls.
- **Deterministic.** Identical `(template_id, seeds, wordlist, seed_value)` must produce byte-identical output. All ordering is total.
- **Georgian alphabet** is U+10D0–U+10FF; words are compared as Python strings (1 code point per letter).
- **Grid rules:** 13×13, 180° rotational symmetry, min word length 3, 40–50 slots, unchecked cells allowed (MVP).
