# Freeform Crossword Construction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an experimental word-first crossword constructor that grows an irregular (non-symmetric) grid by placing real lemma-dataset words until ~28 words at ~0.6 density, wired into the worker Job flow and a `/create` button.

**Architecture:** A pure engine (`app/solver/freeform.py`) grows an unbounded lattice via greedy placement + bounded backtracking, gating every placement on real-crossword validity (every incidental run ≥3 must be a dataset word). A thin worker branch + `persist_freeform` reuse the existing `grid_template`/`Entry` persistence; a second `/create` button drives it.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0, pytest (backend); React + TypeScript + Vitest (frontend). `uv` for backend commands.

## Global Constraints

- Engine is **pure**: no `sqlalchemy`/`fastapi` imports in `app/solver/freeform.py`.
- **Deterministic**: all randomness via `random.Random(seed_value)`; identical `(wordlist, seed_value, params)` ⇒ identical result (holds when not deadline-bounded; tests assert it on small inputs that finish before the deadline).
- **Min word length 3**; runs of length 2 are tolerated as non-words (matches `app/solver/model.py::_runs`, which ignores runs <3).
- Reuse `FilledEntry`, `FillFailure` from `app/solver/run.py`; reuse `build_constraints` (`app/solver/model.py`), `number_cells` (`app/solver/numbering.py`).
- Default pool = **lemmas** at the UI layer; engine is pool-agnostic (takes a `Wordlist`).
- Run backend commands from `backend/` with `uv run`. Run frontend commands from `frontend/`.

---

### Task 1: Engine core — word index + validity gate

**Files:**
- Create: `backend/app/solver/freeform.py`
- Modify: `backend/app/solver/index.py` (add `Wordlist.all()`)
- Test: `backend/tests/solver/test_freeform_validity.py`

**Interfaces:**
- Consumes: `Wordlist` (`app/solver/index.py`) with `by_length(n)` and new `all()`.
- Produces:
  - `Wordlist.all() -> list[str]`
  - `_DELTA: dict[str, tuple[int,int]]` (`"across"->(0,1)`, `"down"->(1,0)`)
  - `_run_through(grid: dict[tuple[int,int],str], r: int, c: int, dr: int, dc: int) -> str`
  - `_placement_valid(grid: dict[tuple[int,int],str], word: str, r0: int, c0: int, direction: str, wordset: set[str]) -> bool`
  - `_letter_index(wordlist: Wordlist, min_len: int) -> dict[str, list[tuple[str,int]]]`

- [ ] **Step 1: Add `Wordlist.all()`**

Modify `backend/app/solver/index.py`, inside `class Wordlist`, after `__len__`:

```python
    def all(self) -> list[str]:
        return [w for bucket in self._by_len.values() for w in bucket]
```

- [ ] **Step 2: Write the failing validity tests**

Create `backend/tests/solver/test_freeform_validity.py` (ASCII letters — the engine is character-agnostic):

```python
from app.solver.freeform import _run_through, _placement_valid


def _grid(words_across):
    # words_across: list of (word, r, c) placed across; returns grid dict
    g = {}
    for w, r, c in words_across:
        for i, ch in enumerate(w):
            g[(r, c + i)] = ch
    return g


def test_run_through_returns_maximal_run():
    g = _grid([("cat", 0, 0)])
    assert _run_through(g, 0, 1, 0, 1) == "cat"   # across run
    assert _run_through(g, 0, 1, 1, 0) == "a"     # down run is single cell


def test_valid_crossing_accepted():
    # "cat" across at (0,0); place "car" down crossing the 'c' at (0,0)
    g = _grid([("cat", 0, 0)])
    assert _placement_valid(g, "car", 0, 0, "down", {"cat", "car"}) is True


def test_overlap_mismatch_rejected():
    g = _grid([("cat", 0, 0)])
    # place "dog" down at (0,0): 'd' != existing 'c'
    assert _placement_valid(g, "dog", 0, 0, "down", {"cat", "dog"}) is False


def test_collinear_merge_rejected():
    # "cat" across at (0,0); placing "dog" across at (0,3) abuts -> merges into "catdog"
    g = _grid([("cat", 0, 0)])
    assert _placement_valid(g, "dog", 0, 3, "across", {"cat", "dog"}) is False


def test_invalid_incidental_run_rejected():
    # A length-2 down stub at column 1: (0,1)="a",(1,1)="b" (tolerated, len 2).
    # Placing across word "qxr" at (2,0) puts a NEW cell "x" at (2,1), extending the
    # column-1 run to "abx" (len 3). "abx" is not in the wordset -> reject.
    g = {(0, 1): "a", (1, 1): "b"}
    assert _placement_valid(g, "qxr", 2, 0, "across", {"qxr"}) is False
```

- [ ] **Step 3: Implement the engine core**

Create `backend/app/solver/freeform.py`:

```python
from app.solver.index import Wordlist

_DELTA = {"across": (0, 1), "down": (1, 0)}


def _run_through(grid: dict[tuple[int, int], str], r: int, c: int, dr: int, dc: int) -> str:
    """Maximal contiguous occupied run through (r,c) along (dr,dc), in order."""
    # walk back to the start of the run
    sr, sc = r, c
    while (sr - dr, sc - dc) in grid:
        sr, sc = sr - dr, sc - dc
    out = []
    cr, cc = sr, sc
    while (cr, cc) in grid:
        out.append(grid[(cr, cc)])
        cr, cc = cr + dr, cc + dc
    return "".join(out)


def _placement_valid(grid, word, r0, c0, direction, wordset) -> bool:
    dr, dc = _DELTA[direction]
    pdr, pdc = (dc, dr)  # perpendicular delta
    cells = [(r0 + dr * i, c0 + dc * i) for i in range(len(word))]

    # a. overlap consistency + collect NEW cells
    new_cells = []
    for i, cell in enumerate(cells):
        existing = grid.get(cell)
        if existing is None:
            new_cells.append((cell, word[i]))
        elif existing != word[i]:
            return False

    if not new_cells:
        return False  # the word is already fully present; not a real new placement

    # b. end-cap: no collinear merge at either end
    before = (r0 - dr, c0 - dc)
    after = (r0 + dr * len(word), c0 + dc * len(word))
    if before in grid or after in grid:
        return False

    # c. incidental runs: simulate, then check every NEW cell's perpendicular run
    temp = dict(grid)
    for cell, ch in new_cells:
        temp[cell] = ch
    for (r, c), _ in new_cells:
        run = _run_through(temp, r, c, pdr, pdc)
        if len(run) >= 3 and run not in wordset:
            return False
    return True


def _letter_index(wordlist: Wordlist, min_len: int) -> dict[str, list[tuple[str, int]]]:
    """letter -> [(word, offset), ...] for every position of every word >= min_len."""
    idx: dict[str, list[tuple[str, int]]] = {}
    for w in wordlist.all():
        if len(w) < min_len:
            continue
        for o, ch in enumerate(w):
            idx.setdefault(ch, []).append((w, o))
    return idx
```

- [ ] **Step 4: Run the validity tests**

Run: `cd backend && uv run pytest tests/solver/test_freeform_validity.py -v`
Expected: all five PASS (`test_run_through_returns_maximal_run`, `test_valid_crossing_accepted`, `test_overlap_mismatch_rejected`, `test_collinear_merge_rejected`, `test_invalid_incidental_run_rejected`).

- [ ] **Step 5: Commit**

```bash
cd backend && git add app/solver/freeform.py app/solver/index.py tests/solver/test_freeform_validity.py
git commit -m "feat(freeform): word index + placement validity gate"
```

---

### Task 2: Engine finalize — normalize, density, entries

**Files:**
- Modify: `backend/app/solver/freeform.py`
- Modify: `backend/scripts/gen_templates.py` (import `cross_ratio` from the engine)
- Test: `backend/tests/solver/test_freeform_finalize.py`

**Interfaces:**
- Consumes: `_DELTA`, `Template` (`app/solver/templates.py`), `build_constraints`, `FilledEntry`.
- Produces:
  - `FreeformResult` dataclass: `rows:int, cols:int, blocks:list[tuple[int,int]], grid:dict[tuple[int,int],str], entries:list[FilledEntry], density:float`
  - `cross_ratio(t: Template) -> float` (moved here from gen_templates)
  - `_finalize(placed_grid: dict[tuple[int,int],str]) -> FreeformResult`

- [ ] **Step 1: Write the failing finalize test**

Create `backend/tests/solver/test_freeform_finalize.py`:

```python
from app.solver.freeform import _finalize


def test_finalize_normalizes_and_reproduces_words():
    # "cat" across at (5,5); "car" down at (5,5). Expect 2 entries, words preserved.
    grid = {}
    for i, ch in enumerate("cat"):
        grid[(5, 5 + i)] = ch
    for i, ch in enumerate("car"):
        grid[(5 + i, 5)] = ch  # (5,5) shared 'c'
    res = _finalize(grid)
    assert res.rows == 3 and res.cols == 3          # bounding box normalized
    answers = sorted(e.answer for e in res.entries)
    assert answers == ["car", "cat"]
    assert all(e.provenance == "freeform" for e in res.entries)
    # blocks = bounding-box cells with no letter (here corners except the L-shape)
    assert (2, 2) in res.blocks
```

Run: `cd backend && uv run pytest tests/solver/test_freeform_finalize.py -v`
Expected: FAIL (`_finalize` not defined / `FreeformResult` missing).

- [ ] **Step 2: Move `cross_ratio` into the engine**

In `backend/app/solver/freeform.py`, add the new imports at the top (Task 1 already imported `Wordlist`; add only these) and the function (copy the body verbatim from `scripts/gen_templates.py`):

```python
from dataclasses import dataclass

from app.solver.model import build_constraints
from app.solver.numbering import number_cells
from app.solver.run import FilledEntry, FillFailure
from app.solver.templates import Template


def cross_ratio(t: Template) -> float:
    """Fraction of white cells crossed by BOTH an across and a down word."""
    blocks = t.blocks

    def in_word(r, c, dr, dc):
        prev = 0 <= r - dr < t.rows and 0 <= c - dc < t.cols and (r - dr, c - dc) not in blocks
        nxt = 0 <= r + dr < t.rows and 0 <= c + dc < t.cols and (r + dr, c + dc) not in blocks
        return prev or nxt

    play = [(r, c) for r in range(t.rows) for c in range(t.cols) if (r, c) not in blocks]
    crossed = sum(1 for (r, c) in play if in_word(r, c, 0, 1) and in_word(r, c, 1, 0))
    return crossed / len(play) if play else 0.0
```

Then in `backend/scripts/gen_templates.py`: delete its local `def cross_ratio(t):` block and add `from app.solver.freeform import cross_ratio` next to the other `app.solver` imports.

- [ ] **Step 3: Implement `FreeformResult` + `_finalize`**

Append to `backend/app/solver/freeform.py`:

```python
@dataclass
class FreeformResult:
    rows: int
    cols: int
    blocks: list[tuple[int, int]]
    grid: dict[tuple[int, int], str]
    entries: list[FilledEntry]
    density: float


def _finalize(placed_grid: dict[tuple[int, int], str]) -> FreeformResult:
    min_r = min(r for r, _ in placed_grid)
    min_c = min(c for _, c in placed_grid)
    grid = {(r - min_r, c - min_c): ch for (r, c), ch in placed_grid.items()}
    rows = max(r for r, _ in grid) + 1
    cols = max(c for _, c in grid) + 1
    blocks = frozenset(
        (r, c) for r in range(rows) for c in range(cols) if (r, c) not in grid
    )
    template = Template(id="freeform", rows=rows, cols=cols, blocks=blocks)
    nums = number_cells(template)
    entries = []
    for con in build_constraints(template):
        answer = "".join(grid[cell] for cell in con.cells)
        entries.append(
            FilledEntry(
                number=con.number,
                direction=con.direction,
                row=con.cells[0][0],
                col=con.cells[0][1],
                answer=answer,
                provenance="freeform",
            )
        )
    return FreeformResult(
        rows=rows, cols=cols, blocks=sorted(blocks), grid=grid,
        entries=entries, density=cross_ratio(template),
    )
```

- [ ] **Step 4: Run finalize test + the gen_templates import sanity check**

Run: `cd backend && uv run pytest tests/solver/test_freeform_finalize.py -v`
Expected: PASS.

Run: `cd backend && uv run python -c "import scripts.gen_templates; print('gen_templates imports cross_ratio OK')"`
Expected: prints the OK line (no ImportError).

- [ ] **Step 5: Commit**

```bash
cd backend && git add app/solver/freeform.py scripts/gen_templates.py tests/solver/test_freeform_finalize.py
git commit -m "feat(freeform): finalize to normalized grid + shared cross_ratio"
```

---

### Task 3: Engine — `construct()` greedy grow + backtracking

**Files:**
- Modify: `backend/app/solver/freeform.py`
- Test: `backend/tests/solver/test_freeform_construct.py`

**Interfaces:**
- Consumes: `_DELTA`, `_placement_valid`, `_run_through`, `_letter_index`, `_finalize`, `FreeformResult`, `FillFailure`, `Wordlist`.
- Produces:
  - `construct(wordlist: Wordlist, seed_value: int, *, target_words: int = 28, target_density: float = 0.6, min_len: int = 3, seed_min_len: int = 10, min_words: int = 20, backtrack_budget: int = 2000, max_iters: int = 200000, deadline_s: float = 20.0) -> FreeformResult | FillFailure`

- [ ] **Step 1: Write the failing construct tests**

Create `backend/tests/solver/test_freeform_construct.py`:

```python
from app.solver.freeform import construct, _DELTA, _run_through, FreeformResult
from app.solver.index import Wordlist

# A small interlocking word set (ASCII; engine is char-agnostic).
WORDS = [
    "cart", "care", "cane", "core", "cope", "rope", "ripe", "rice",
    "race", "rate", "tare", "tine", "vine", "pane", "pine", "code",
    "node", "mode", "made", "mare", "acre", "earn", "near", "neat",
    "tend", "rend", "send", "sane", "lane", "land",
]


def _all_runs_valid(res: FreeformResult, wordset):
    # every >=3 run (across+down) in the normalized grid must be a dataset word
    for direction, (dr, dc) in _DELTA.items():
        for (r, c) in res.grid:
            if (r - dr, c - dc) in res.grid:
                continue  # not a run start
            run = _run_through(res.grid, r, c, dr, dc)
            if len(run) >= 3:
                assert run in wordset, f"invalid run {run!r}"


def test_construct_produces_valid_connected_puzzle():
    wl = Wordlist(WORDS)
    res = construct(wl, seed_value=1, target_words=10, seed_min_len=4,
                    min_words=3, deadline_s=10.0)
    assert isinstance(res, FreeformResult)
    assert len(res.entries) >= 3
    _all_runs_valid(res, set(WORDS))


def test_construct_is_deterministic():
    wl = Wordlist(WORDS)
    a = construct(wl, seed_value=7, target_words=10, seed_min_len=4, min_words=3, deadline_s=10.0)
    b = construct(wl, seed_value=7, target_words=10, seed_min_len=4, min_words=3, deadline_s=10.0)
    assert isinstance(a, FreeformResult) and isinstance(b, FreeformResult)
    assert [e.answer for e in a.entries] == [e.answer for e in b.entries]
    assert a.grid == b.grid
```

Run: `cd backend && uv run pytest tests/solver/test_freeform_construct.py -v`
Expected: FAIL (`construct` not defined).

- [ ] **Step 2: Implement `construct()`**

Append to `backend/app/solver/freeform.py` (add `import random` and `import time` at the top):

```python
def _apply(grid, word, r0, c0, direction):
    dr, dc = _DELTA[direction]
    added = []
    for i, ch in enumerate(word):
        cell = (r0 + dr * i, c0 + dc * i)
        if cell not in grid:
            added.append(cell)
        grid[cell] = ch
    return added  # cells this placement newly occupied (for undo)


def _new_crossings(grid, word, r0, c0, direction) -> int:
    dr, dc = _DELTA[direction]
    pdr, pdc = (dc, dr)
    score = 0
    for i in range(len(word)):
        cell = (r0 + dr * i, c0 + dc * i)
        if cell in grid:
            continue  # crossing an existing word: already counted by that word
        r, c = cell
        if (r + pdr, c + pdc) in grid or (r - pdr, c - pdc) in grid:
            score += 1
    return score


def _candidate_placements(grid, placed, letter_idx, wordset):
    """Yield (word, r0, c0, direction) valid placements crossing existing cells."""
    for word, pr, pc, pdir in placed:
        pdr, pdc = _DELTA[pdir]
        cross_dir = "down" if pdir == "across" else "across"
        dr, dc = _DELTA[cross_dir]
        for i in range(len(word)):
            cell = (pr + pdr * i, pc + pdc * i)
            L = grid[cell]
            for cand, offset in letter_idx.get(L, ()):
                r0, c0 = cell[0] - dr * offset, cell[1] - dc * offset
                if _placement_valid(grid, cand, r0, c0, cross_dir, wordset):
                    yield (cand, r0, c0, cross_dir)


def construct(wordlist, seed_value, *, target_words=28, target_density=0.6,
              min_len=3, seed_min_len=10, min_words=20, backtrack_budget=2000,
              max_iters=200000, deadline_s=20.0):
    rng = random.Random(seed_value)
    words = wordlist.all()
    if not words:
        return FillFailure(reason="freeform: empty wordlist")
    wordset = set(words)
    letter_idx = _letter_index(wordlist, min_len)

    seed_pool = [w for w in words if len(w) >= seed_min_len] or \
        sorted(words, key=len, reverse=True)[: max(1, len(words) // 10)]
    seed_word = rng.choice(sorted(seed_pool))

    grid: dict[tuple[int, int], str] = {}
    _apply(grid, seed_word, 0, 0, "across")
    placed = [(seed_word, 0, 0, "across")]
    best = list(placed)
    best_grid = dict(grid)

    blacklist: set = set()
    undos = 0
    deadline = time.monotonic() + deadline_s

    for _ in range(max_iters):
        if len(placed) >= target_words or time.monotonic() > deadline:
            break
        # gather + score candidates (skip blacklisted at this depth)
        depth = len(placed)
        cands = []
        for cand in _candidate_placements(grid, placed, letter_idx, wordset):
            if (depth, cand) in blacklist:
                continue
            cands.append(cand)
        if cands:
            # prefer most new crossings (density), then mid-length (5-9), then seeded shuffle
            rng.shuffle(cands)
            cands.sort(key=lambda c: (
                -_new_crossings(grid, c[0], c[1], c[2], c[3]),
                abs(len(c[0]) - 7),
            ))
            chosen = cands[0]
            _apply(grid, *chosen)
            placed.append(chosen)
            if len(placed) > len(best):
                best, best_grid = list(placed), dict(grid)
        else:
            # dead-end: backtrack
            if len(placed) <= 1 or undos >= backtrack_budget:
                break
            last = placed.pop()
            blacklist.add((len(placed), last))
            # rebuild grid from scratch (simple + correct for an experiment)
            grid = {}
            for w, r, c, d in placed:
                _apply(grid, w, r, c, d)
            undos += 1

    final_placed, final_grid = (best, best_grid) if len(best) >= len(placed) else (placed, grid)
    if len(final_placed) < min_words:
        return FillFailure(reason=f"freeform: only {len(final_placed)} words (need {min_words})")
    return _finalize(final_grid)
```

- [ ] **Step 3: Run the construct tests**

Run: `cd backend && uv run pytest tests/solver/test_freeform_construct.py -v`
Expected: PASS (valid connected puzzle ≥3 words; deterministic across two runs).

- [ ] **Step 4: Run the whole solver suite (no regressions)**

Run: `cd backend && uv run pytest tests/solver -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd backend && git add app/solver/freeform.py tests/solver/test_freeform_construct.py
git commit -m "feat(freeform): construct() greedy grow + bounded backtracking"
```

---

### Task 4: Service wiring — Job branch + `persist_freeform`

**Files:**
- Modify: `backend/app/services/solver_jobs.py`
- Test: `backend/tests/test_solver_jobs_freeform.py`

**Interfaces:**
- Consumes: `construct`, `FreeformResult` (`app/solver/freeform.py`); existing `enqueue_fill`, `run_fill_job`, `Job`, `Puzzle`, `Entry`, `number_cells`, `Template`.
- Produces:
  - `enqueue_fill(..., mode: str = "normal", word_count: int = 28, target_density: float = 0.6)` — adds `mode`/`word_count`/`target_density` to `Job.params`.
  - `persist_freeform(db: Session, puzzle_id: uuid.UUID, result: FreeformResult) -> None`
  - `run_fill_job` branches to freeform when `params["mode"] == "freeform"`.

- [ ] **Step 1: Write the failing service tests**

Create `backend/tests/test_solver_jobs_freeform.py`:

```python
import datetime as dt
import uuid

from app.models import Job, Puzzle
from app.services.solver_jobs import enqueue_fill, persist_freeform, run_fill_job
from app.solver.freeform import FreeformResult
from app.solver.run import FilledEntry
from app.solver.index import Wordlist


def _draft(db):
    p = Puzzle(id=uuid.uuid4(), live_date=dt.date(2026, 7, 1), theme="t",
               grid_template={}, status="draft", seed=7, version=1)
    db.add(p)
    db.flush()
    return p


def test_persist_freeform_writes_template_and_entries(db_session):
    p = _draft(db_session)
    res = FreeformResult(
        rows=3, cols=3, blocks=[(2, 2)],
        grid={(0, 0): "c", (0, 1): "a", (0, 2): "t", (1, 0): "a", (2, 0): "r"},
        entries=[
            FilledEntry(1, "across", 0, 0, "cat", "freeform"),
            FilledEntry(1, "down", 0, 0, "car", "freeform"),
        ],
        density=0.5,
    )
    persist_freeform(db_session, p.id, res)
    db_session.flush()
    reloaded = db_session.get(Puzzle, p.id)
    assert reloaded.grid_template["rows"] == 3
    assert reloaded.grid_template["blocks"] == [[2, 2]]
    assert sorted(e.answer for e in reloaded.entries) == ["car", "cat"]
    assert all(e.provenance == "freeform" for e in reloaded.entries)


def test_run_fill_job_freeform_branch_persists(db_session):
    p = _draft(db_session)
    words = ["cart", "care", "core", "rope", "race", "rate", "acre", "earn",
             "near", "neat", "tend", "send", "sane", "lane", "land", "cane"]
    job = enqueue_fill(db_session, p.id, seed_value=1, min_seeds=0,
                       mode="freeform", word_count=8)
    db_session.flush()
    run_fill_job(db_session, job.id, library=[], seeds=[], wordlist=Wordlist(words))
    db_session.flush()
    reloaded = db_session.get(Job, job.id)
    assert reloaded.status == "done"
    assert db_session.get(Puzzle, p.id).entries
```

Run: `cd backend && uv run pytest tests/test_solver_jobs_freeform.py -v`
Expected: FAIL (`persist_freeform` not defined; `enqueue_fill` has no `mode`).

- [ ] **Step 2: Extend `enqueue_fill` with the freeform params**

In `backend/app/services/solver_jobs.py`, change the `enqueue_fill` signature and `params` dict:

```python
def enqueue_fill(
    db: Session,
    puzzle_id: uuid.UUID,
    seed_value: int,
    min_seeds: int,
    template_id: str | None = None,
    prefilled: dict[str, str] | None = None,
    wordpool: str = "default",
    mode: str = "normal",
    word_count: int = 28,
    target_density: float = 0.6,
) -> Job:
    job = Job(
        id=uuid.uuid4(), kind="fill", puzzle_id=puzzle_id, status="pending",
        params={
            "seed_value": seed_value,
            "min_seeds": min_seeds,
            "template_id": template_id,
            "prefilled": prefilled or {},
            "wordpool": wordpool,
            "mode": mode,
            "word_count": word_count,
            "target_density": target_density,
        },
    )
    db.add(job)
    db.flush()
    return job
```

- [ ] **Step 3: Add `persist_freeform`**

In `backend/app/services/solver_jobs.py`, add (near `persist_fill`); add `from app.solver.freeform import FreeformResult, construct` to the imports and `from app.solver.templates import Template` is already present:

```python
def persist_freeform(db: Session, puzzle_id: uuid.UUID, result) -> None:
    puzzle = db.get(Puzzle, puzzle_id)
    if puzzle is None:
        raise ValueError("puzzle not found")
    template = Template(id="freeform", rows=result.rows, cols=result.cols,
                        blocks=frozenset(tuple(b) for b in result.blocks))
    puzzle.grid_template = grid_template_from(template)
    for fe in result.entries:
        puzzle.entries.append(
            Entry(
                id=uuid.uuid4(), number=fe.number, direction=fe.direction,
                answer=fe.answer, row=fe.row, col=fe.col,
                clue=None, clue_status="pending", provenance=fe.provenance,
            )
        )
    db.flush()
```

- [ ] **Step 4: Branch `run_fill_job` for freeform**

In `backend/app/services/solver_jobs.py`, at the start of `run_fill_job` (right after `job.status = "running"; db.flush()`), insert:

```python
    if job.params.get("mode") == "freeform":
        outcome = construct(
            wordlist, job.params["seed_value"],
            target_words=job.params.get("word_count", 28),
            target_density=job.params.get("target_density", 0.6),
        )
        if isinstance(outcome, FreeformResult):
            persist_freeform(db, job.puzzle_id, outcome)
            job.status = "done"
            job.result = {"mode": "freeform", "entries": len(outcome.entries),
                          "density": round(outcome.density, 3)}
            log.info("freeform done: puzzle=%s job=%s entries=%d density=%.2f",
                     job.puzzle_id, job.id, len(outcome.entries), outcome.density)
        else:
            job.status = "failed"
            job.error = outcome.reason
            log.warning("freeform failed: puzzle=%s job=%s reason=%s",
                        job.puzzle_id, job.id, outcome.reason)
        db.flush()
        return job
```

(This sits before the existing `tid = job.params.get("template_id")` block so freeform never hits the template path.)

- [ ] **Step 5: Run the service tests + the existing solver_jobs tests**

Run: `cd backend && uv run pytest tests/test_solver_jobs_freeform.py tests/test_solver_jobs.py -v`
Expected: PASS (new freeform tests + existing fill/persist tests still green).

- [ ] **Step 6: Commit**

```bash
cd backend && git add app/services/solver_jobs.py tests/test_solver_jobs_freeform.py
git commit -m "feat(freeform): job branch + persist_freeform"
```

---

### Task 5: Admin endpoint — accept `mode` on the fill request

**Files:**
- Modify: `backend/app/routers/admin.py`
- Test: `backend/tests/test_admin_fill_freeform.py`

**Interfaces:**
- Consumes: `enqueue_fill(..., mode=, word_count=, target_density=)` from Task 4.
- Produces: `FillRequest` gains `mode: str = "normal"`, `word_count: int = 28`, `target_density: float = 0.6`; `request_fill` forwards them.

- [ ] **Step 1: Write the failing endpoint test**

Create `backend/tests/test_admin_fill_freeform.py`:

```python
import datetime as dt
import uuid

from app.models import Job, Puzzle


def _draft(db):
    p = Puzzle(id=uuid.uuid4(), live_date=dt.date(2026, 7, 1), theme="t",
               grid_template={}, status="draft", seed=1, version=1)
    db.add(p)
    db.flush()
    return p


def test_fill_request_enqueues_freeform_job(client, db_session):
    p = _draft(db_session)
    db_session.commit()
    r = client.post(f"/api/admin/puzzles/{p.id}/fill",
                    json={"mode": "freeform", "word_count": 24, "wordpool": "lemmas"})
    assert r.status_code == 202
    job = db_session.query(Job).filter(Job.puzzle_id == p.id).one()
    assert job.params["mode"] == "freeform"
    assert job.params["word_count"] == 24
    assert job.params["wordpool"] == "lemmas"
```

Run: `cd backend && uv run pytest tests/test_admin_fill_freeform.py -v`
Expected: FAIL (FillRequest has no `mode`; param not stored).

- [ ] **Step 2: Extend `FillRequest` and `request_fill`**

In `backend/app/routers/admin.py`, update the model and the call:

```python
class FillRequest(BaseModel):
    seed_value: int = 0
    min_seeds: int = 10
    template_id: str | None = None
    prefilled: dict[str, str] = {}
    wordpool: str = "default"
    mode: str = "normal"          # "normal" | "freeform"
    word_count: int = 28
    target_density: float = 0.6
```

And in `request_fill`, pass the new fields:

```python
    job = enqueue_fill(db, puzzle_id, body.seed_value, body.min_seeds,
                       template_id=body.template_id, prefilled=body.prefilled,
                       wordpool=body.wordpool, mode=body.mode,
                       word_count=body.word_count, target_density=body.target_density)
```

(Leave the existing `log.info("fill enqueued ...")` line; optionally append `mode=%s`.)

- [ ] **Step 3: Run the endpoint test**

Run: `cd backend && uv run pytest tests/test_admin_fill_freeform.py tests/test_admin_fill.py -v`
Expected: PASS (new + existing fill endpoint tests).

- [ ] **Step 4: Full backend suite**

Run: `cd backend && uv run pytest -m "not perf" -q`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd backend && git add app/routers/admin.py tests/test_admin_fill_freeform.py
git commit -m "feat(freeform): accept mode/word_count on fill endpoint"
```

---

### Task 6: Frontend — „თავისუფალი ფორმა" button in /create

**Files:**
- Modify: `frontend/src/api/admin.ts` (`FillOpts` + `requestFill`)
- Modify: `frontend/src/pages/PuzzleBuilder.tsx` (button + freeform generate path)
- Test: `frontend/src/pages/__test__/PuzzleBuilder.freeform.test.tsx`

**Interfaces:**
- Consumes: existing `createPuzzle`, `requestFill`, `pollJob`, `fetchPuzzle`.
- Produces: `FillOpts` gains `mode?`, `wordCount?`, `targetDensity?`; `requestFill` sends them; a `generateFreeform()` handler.

- [ ] **Step 1: Extend `FillOpts` + `requestFill`**

In `frontend/src/api/admin.ts`:

```typescript
export interface FillOpts {
  seedValue?: number;
  minSeeds?: number;
  templateId?: string;
  prefilled?: Record<string, string>;
  wordpool?: string;
  mode?: string;
  wordCount?: number;
  targetDensity?: number;
}
```

And in the `requestFill` body object add:

```typescript
      mode: opts.mode ?? "normal",
      word_count: opts.wordCount ?? 28,
      target_density: opts.targetDensity ?? 0.6,
```

- [ ] **Step 2: Write the failing component test**

Create `frontend/src/pages/__test__/PuzzleBuilder.freeform.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter, createRootRoute, createRoute, createMemoryHistory } from "@tanstack/react-router";
import { vi, expect, test, beforeEach } from "vitest";
import { PuzzleBuilder } from "../PuzzleBuilder";

function renderWithProviders() {
  const root = createRootRoute();
  const idx = createRoute({ getParentRoute: () => root, path: "/", component: PuzzleBuilder });
  const router = createRouter({
    routeTree: root.addChildren([idx]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/templates")) return new Response(JSON.stringify([]));
    if (url.endsWith("/puzzles") && init?.method === "POST")
      return new Response(JSON.stringify({ id: "p1", theme: "t", live_date: "2026-07-01", status: "draft" }));
    if (url.includes("/fill")) {
      const body = JSON.parse(init!.body as string);
      (globalThis as any).__fillBody = body;
      return new Response(JSON.stringify({ job_id: "j1" }), { status: 202 });
    }
    if (url.includes("/jobs/")) return new Response(JSON.stringify({ status: "done", result: null, error: null }));
    if (url.includes("/puzzles/p1")) return new Response(JSON.stringify({ id: "p1", theme: "t", status: "draft", grid_template: {}, entries: [] }));
    return new Response("{}");
  }));
});

test("freeform button posts mode=freeform", async () => {
  renderWithProviders();
  fireEvent.click(await screen.findByText("თავისუფალი ფორმა"));
  await waitFor(() => expect((globalThis as any).__fillBody?.mode).toBe("freeform"));
});
```

Run: `cd frontend && npx vitest run src/pages/__test__/PuzzleBuilder.freeform.test.tsx`
Expected: FAIL (no „თავისუფალი ფორმა" button).

- [ ] **Step 3: Add the freeform handler + button**

In `frontend/src/pages/PuzzleBuilder.tsx`, add a handler next to `generate()`:

```tsx
  async function generateFreeform() {
    setError(null); setDetail(null); setStatus("creating");
    try {
      const p = await createPuzzle();
      setPuzzleId(p.id);
      const seedValue = Math.floor(Math.random() * 1_000_000);
      const { job_id } = await requestFill(p.id, {
        mode: "freeform", wordCount: 28, wordpool, seedValue,
      });
      setStatus("filling");
      for (;;) {
        const job = await pollJob(job_id);
        if (job.status === "done") break;
        if (job.status === "failed") { setError(job.error ?? "freeform failed"); setStatus(null); return; }
        await new Promise((r) => setTimeout(r, 1000));
      }
      setDetail(await fetchPuzzle(p.id));
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "error"); setStatus(null);
    }
  }
```

Then add the button next to the existing Generate button (in the `flex items-end gap-2` row):

```tsx
        <Button onClick={generateFreeform} disabled={status === "filling" || status === "creating"}>
          თავისუფალი ფორმა
        </Button>
```

- [ ] **Step 4: Run the component test + typecheck**

Run: `cd frontend && npx vitest run src/pages/__test__/PuzzleBuilder.freeform.test.tsx`
Expected: PASS.

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/api/admin.ts src/pages/PuzzleBuilder.tsx src/pages/__test__/PuzzleBuilder.freeform.test.tsx
git commit -m "feat(freeform): /create button for freeform construction"
```

---

## Manual verification (after all tasks)

1. Start Postgres + backend worker: `cd backend && uv run python -m app.worker` (the worker reloads templates per tick; freeform needs no template).
2. Start frontend: `cd frontend && npm run dev`.
3. Go to `/admin/create`, pick the **lemmas** wordpool, click **„თავისუფალი ფორმა"**.
4. Expect an irregular filled grid + word list to appear via the existing `<PuzzleEntries>` view, ~20–30 words. Re-click to get a different puzzle (random seed). Try autoclue + publish to confirm the puzzle flows through unchanged.

## Notes / future work (out of scope here)

- Letter-position index makes candidate scanning O(matches) not O(words); already included. If construction is slow on the full 8.8k lemma pool, lower `max_iters`/`deadline_s` or cap `backtrack_budget`.
- Density is a soft selection bias, not a hard gate; if puzzles land below ~0.5, add a post-accept density floor or a denser seed strategy (a later iteration).
- Beam search (approach C) remains a future optimization if greedy+backtracking underperforms on density.
