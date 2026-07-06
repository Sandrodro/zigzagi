# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Zigzagi is a Georgian-language daily crossword platform. Two surfaces: an **Admin Studio** (source text → word pool → solver fill → AI clues → publish) and a **Play** view (daily solve, NYT-like). The solver is pure-Python deterministic CSP; clue generation uses Gemini. See `DESIGN.md` for full architecture decisions and `PRD.md` for product scope.

## Git workflow

**Commit straight to `main`. Do not create branches** for this work — no feature branches, no PRs unless explicitly asked.

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

Flow: `POST /api/admin/puzzles` (draft) → load seed words (`POST /api/admin/extract` or pool accept) → `POST /api/admin/puzzles/{id}/fill {seed_value, min_seeds}` enqueues a fill `Job` → worker runs `fill()` and persists → `POST .../clues` → review → `POST .../schedule {live_date}` → worker publishes on the live date. (Clue review is *not* required to schedule — the clue-status guard in `can_publish` was removed; only "has entries" is enforced.)

**Viewing a generated crossword on `/list`:** `/list` calls `list_published()` = `SELECT Puzzle WHERE status='published'` ordered by `live_date desc` — **no date filter, so any `published` puzzle shows regardless of `live_date`.** A puzzle is therefore visible iff `status == "published"` AND it has a filled `grid_template` (`rows/cols/blocks/cells`, set by `persist_fill`) + `entries` (else `to_play_dto` raises). The normal route there: `schedule_puzzle` sets `status="scheduled"` + `live_date`, then `promote_due_puzzles` (worker, on/after `live_date`) flips `scheduled → published`. To publish immediately for a demo, set `status="published"` directly (entry `clue` may be `null` — play still renders). Clues are real only after `POST .../clues` (Gemini); otherwise set a placeholder.

**CREATE via Admin (`/admin/create`):** pick a template from the graphical picker, type letters directly into the grid, then Generate posts a draft + a fill `Job` with `{template_id, prefilled, min_seeds:0}`. `prefilled` maps slot key (`"1A"`/`"3D"`) → exact word and is derived only from slots the user fully typed; the solver fixes those slots and fills the rest (`fill(..., prefilled=...)` in `solver/run.py`, pinned slots get `provenance="manual"`). The worker must be running. From the LIST detail: Publish = `POST .../schedule` (status `scheduled`; worker promotes on `live_date`); Delete = `DELETE /api/admin/puzzles/{id}` (entries cascade).

**AI word-check (LIST detail):** `POST .../entries/{id}/check` (per word) and `POST .../check-words` (whole puzzle) use the SUGGEST model. An invalid answer is blocked in `wordlist_entries`; a replacement that matches the slot's crossing pattern is added (active) and written back to the entry. Greedy per-entry (checked cells stay fixed, so crossings hold) — see `services/word_check.py`.

- **Current grid size is 11×11.** Templates are a curated library, not generated. `app/solver/templates/*.json` (currently `11x11-001`…`11x11-003`, all targeting ~0.6 crossing ratio). Each is `{id, rows, cols, blocks:[[r,c]...]}`. `templates.py`: `load_library()`, `validate_template()` (symmetry, connectivity, **slot count = area × 0.16–0.28**, i.e. 19–34 for 11×11), `pick_template(library, seed_value)` = `library[seed_value % len(library)]`. New templates must also fill: generate with `uv run python -m scripts.gen_templates` (from `backend/`), which random-searches symmetric layouts, gates on `validate_template` + a max-entry-length cap, and confirms each with a real `fill()` against the DB wordlist before writing. Levers (see the script's docstring):
  - `--max-cross-ratio` / `--min-cross-ratio` — **the overlap lever.** Crossing ratio = fraction of white cells crossed by *both* an across and a down word. Lower = "less overlapping words" (more unchecked cells). Random symmetric grids cluster around ~0.82; ~0.6 is the current target. **Counter-intuitive:** low-overlap grids are *easier to fill* (fewer constraints) but *rare in the random distribution*, so finding one is slow (millions of iterations) — the cost is search/discovery, not the solve. Pair min+max for a band.
  - `--max-len` — caps entry length (lower = shorter words). NOT a density/overlap knob: capping length yields *more, shorter* words that cross *more*. Use only to keep entries ≤ wordlist cap.
  - `--blocks MIN MAX` — black-square count; more blocks → lower crossing ratio (more isolated cells).
  - `--slot-band MIN MAX` — per-run override of the slot-density band (`SLOT_DENSITY_MIN/MAX` in `templates.py`).
- **Solver entry:** `app/solver/run.py::fill(template, seeds, wordlist, seed_value, min_seeds=10, deadline_s=10.0)` → constraints (`model.py`) → seed-slot pick (`seeds.py`) → length-indexed wordlist (`index.py`) → forward-checking CSP with dynamic MRV (`fill.py`). Persisted by `services/solver_jobs.py::persist_fill`. **Value ordering is a seeded shuffle** (`random.Random(seed_value)` in `fill.py`), not alphabetical — decorrelates candidate choices to escape dead-ends, while staying reproducible per `seed_value` (so determinism holds). **Reserved seed slots draw ONLY from the seed pool, matched by exact length** — a small/curated seed pool fails instantly ("no seed word of length N") on a reserved long slot, so fills need a generous seed pool (the full wordlist works).
- **Wordlist** lives in the `wordlist_entries` table (not a checked-in file); populated via `POST /api/admin/wordlist/bulk`. Validation (`services/wordlist.py`): Georgian-only, length 3–13.
- **Other sizes (e.g. 13×13, 20×20):** the solver/CSP is size-agnostic (we moved 10×10 → 11×11 with no code change beyond `--rows/--cols`). To add a size: add a template JSON of that size (the `validate_template` slot band scales with area automatically), and relax the `len > 13` word-length cap in `services/wordlist.py` if entries exceed 13. No size config exists today; `pick_template` mixes all sizes in the library by `seed_value`.

## Frontend

**Stack:** React 18, TypeScript, Vite, TanStack Query (react-query) for server state, TanStack Router (code-based route tree in `src/router.tsx`) for routing, Vitest + Testing Library (no Tailwind yet).

```sh
cd frontend && npm test          # vitest run
cd frontend && npm run build     # tsc + vite build
```

**Key layout:**
- `src/engine/crossword.ts` — pure, framework-agnostic solving engine (active cell, navigation, check/reveal state); unit-tested in isolation
- `src/engine/types.ts` — shared types
- **`src/pages/`** — full-screen views mounted by a route or the admin shell (`PlayView`, `PuzzleList`, `AdminApp`, and the admin route screens `PuzzleListAdmin`/`PuzzleDetail`/`PuzzleBuilder`/`WordPool`; `PoolReview` is reused inside `WordPool`; `WordlistManager` exists but is no longer routed). **`src/components/`** — reusable pieces pages compose (`Grid`, `ClueBar`, `ClueList`, `Timer`, `CongratsModal`, `Background`, `DataTable`, …). Pages import components via `../components/X`.
- `src/api/play.ts` — TanStack Query hooks for Play endpoints (`usePuzzle(date?)`, `usePuzzleList`, `useCheckCells`, `useRevealCells`); raw `fetch` wrappers are module-private. `QueryClientProvider` and `RouterProvider` are set up in `src/main.tsx` (the route tree lives in `src/router.tsx`); component tests must wrap renders in `QueryClientProvider`, and components using `<Link>` also need a (memory) router.
- Routes (`src/router.tsx`): `/` Play (today), `/play?date=` Play (a published puzzle by date), `/list` published-puzzle list, and `/admin` admin shell with **nested routes**: `/admin` (LIST — all crosswords + delete, detail at `/admin/puzzles/$puzzleId` with publish, AI word-check, and the finished grid rendered graphically), `/admin/create` (CREATE — graphical template picker + type directly into the grid + async fill), `/admin/wordpool` (WORDPOOL — add + extract candidate words). The admin surface uses raw `fetch` wrappers in `src/api/admin.ts` (NOT react-query) + local `useState`; the shell is `<Link>`s + `<Outlet/>`.
- **Reuse the Play crossword renderer for admin grids.** CREATE (picker + editable fill) and the LIST detail (finished puzzle) both build a `CrosswordEngine` (`src/engine/crossword.ts`) and render `<Grid>` (`src/components/Grid.tsx`) — the same components Play uses. Adapters in `src/engine/puzzleData.ts`: `templateToPuzzleData(TemplateDto)`, `puzzleDetailToPuzzleData(detail)`, `answerFills(entries)`, `slotKey(slot)`. CREATE drives the engine via an off-screen input (mirrors `PlayView`) and derives `prefilled` from fully-typed slots only.
- **Tests** live in a `__test__/` folder next to the code under test (e.g. `src/components/__test__/`, `src/pages/__test__/`). Component/page tests mock `fetch` (via `vi.stubGlobal`) rather than the api module.
- The project is **TypeScript-only** (`.ts`/`.tsx`); `tsc` runs with `noEmit` (Vite transpiles), so no `.js` artifacts in `src/`.

## Architecture invariants

- **Answers never leave the server** for the web Play API — grid structure + clues only; check/reveal are server-side. **One sanctioned exception:** `GET /api/play/puzzles/by-id/{id}/bundle` returns the solution too; it exists so the iOS app (`ios/`) can solve offline.
- **Solver is pure.** `app/solver/` has zero FastAPI or SQLAlchemy imports — it's a pure function `fill(template, seeds, wordlist, seed_value) -> FillResult | FillFailure`.
- **Fill runs async.** Solver fill is enqueued as a `Job` row and processed by the worker; HTTP only enqueues and polls.
- **Deterministic.** Identical `(template_id, seeds, wordlist, seed_value)` must produce byte-identical output. All ordering is total.
- **Georgian alphabet** is U+10D0–U+10FF; words are compared as Python strings (1 code point per letter).
- **Grid rules:** 11×11 (size-agnostic solver), 180° rotational symmetry, min word length 3, slot count = area × 0.16–0.28, ~0.6 crossing ratio (low overlap), unchecked cells allowed (MVP).
