# Admin Panel (LIST / CREATE / WORDPOOL) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/admin` as three nested routes — LIST (all crosswords, per-puzzle publish + AI word-validity check), CREATE (pick a template, type words into specific slots, fill the rest, save), and WORDPOOL (extract + manually add themed candidate words).

**Architecture:** FastAPI backend exposes new admin endpoints; the pure CSP solver gains a "pre-filled slots" capability (specific slots fixed to a word, the rest auto-filled). Fill stays async (Job + worker). The React admin shell becomes a TanStack Router parent route with three child routes and a puzzle-detail child route, following the existing raw-`fetch`-in-`admin.ts` + `useState` pattern (the admin surface does NOT use TanStack Query). The AI word-validity check uses the SUGGEST Gemini model and writes to the solver wordlist (`wordlist_entries`).

**Tech Stack:** Python 3.12 / FastAPI / SQLAlchemy 2.0 / pytest; React 18 / TypeScript / TanStack Router / Vitest + Testing Library.

## Global Constraints

- **Grids are 11×11.** Solver is size-agnostic; do not hardcode size.
- **Answers never leave the server** for Play; admin endpoints may return answers (admin is trusted).
- **Solver is pure.** `app/solver/` imports zero FastAPI/SQLAlchemy. `fill()` stays a pure function.
- **Deterministic.** Identical `(template_id, seeds, wordlist, seed_value, prefilled)` → byte-identical output. All ordering total.
- **Fill runs async** as a `Job` processed by `python -m app.worker`; HTTP only enqueues + polls.
- **Georgian alphabet** is U+10D0–U+10FF; words compared as Python strings (1 code point per letter). Word length 3–13.
- **Commit straight to `main`. No branches, no PRs.** (per CLAUDE.md "Git workflow")
- **Frontend is TypeScript-only** (`.ts`/`.tsx`); tests live in `__test__/` next to the code and mock `fetch` via `vi.stubGlobal`. The admin surface uses raw async functions in `src/api/admin.ts` (NOT react-query) + local `useState`; match that.
- **Backend tests:** fixtures in `tests/conftest.py` are `db_session` (rolled-back session) and `client` (TestClient with `get_db` overridden). Override AI with `app.dependency_overrides[get_gemini]`. Run from `backend/`. Mark wordlist-dependent fill tests `@pytest.mark.perf` only if they need the real 47k list; the tests here build tiny in-test wordlists.
- **Slot key format** (shared frontend↔backend): `f"{number}{'A' if across else 'D'}"`, e.g. `"1A"`, `"3D"`.

---

## File Structure

**Backend — create:**
- `app/services/word_check.py` — AI word-validity check + wordlist block/add + entry answer fix.
- `tests/test_solver_prefilled.py`, `tests/test_word_check.py`, `tests/test_admin_templates.py`, `tests/test_admin_list_puzzles.py`, `tests/test_admin_word_check.py`, `tests/test_admin_pool_add.py`.

**Backend — modify:**
- `app/solver/run.py` — `fill()` gains `prefilled` param.
- `app/services/solver_jobs.py` — `enqueue_fill`/`run_fill_job` gain `template_id` + `prefilled`; add `list_template_dtos()`.
- `app/services/puzzles.py` — add `list_all()`.
- `app/services/wordlist.py` — add `block_word()`.
- `app/services/pool.py` — add `create_candidate()`.
- `app/ai/client.py` — add `WordCheck` model + `check_word()` to the `GeminiClient` protocol.
- `app/ai/gemini.py` — implement `check_word()` (SUGGEST model).
- `app/routers/admin.py` — new endpoints: `GET /templates`, `GET /puzzles`, `POST /pool`, `POST /puzzles/{id}/entries/{entry_id}/check`, `POST /puzzles/{id}/check-words`; extend `FillRequest`.

**Frontend — create:**
- `src/pages/PuzzleListAdmin.tsx` (LIST index), `src/pages/PuzzleDetail.tsx` (per-crossword page), `src/pages/WordPool.tsx`.
- matching tests under `src/pages/__test__/`.

**Frontend — modify:**
- `src/router.tsx` — nest child routes under `/admin`.
- `src/pages/AdminApp.tsx` — shell: nav `<Link>`s + `<Outlet/>` (drop the in-page tab `useState`).
- `src/pages/PuzzleBuilder.tsx` (CREATE) — template picker + per-slot inputs + async generate + view link.
- `src/api/admin.ts` — new functions + extended `requestFill`.

**Decision (stated):** the standalone 47k `WordlistManager` is **removed from admin nav** — the three sections are LIST/CREATE/WORDPOOL exactly as specified. The component file stays in the tree (unrouted) so nothing is deleted; re-add a route later if direct wordlist editing is wanted. The AI word-check is the wordlist's write path for now.

---

# Phase A — Solver: pre-filled slots

### Task A1: `fill()` accepts `prefilled` (specific slots fixed to a word)

**Files:**
- Modify: `backend/app/solver/run.py`
- Test: `backend/tests/test_solver_prefilled.py`

**Interfaces:**
- Consumes: `fill(template, seeds, wordlist, seed_value, min_seeds=10, deadline_s=10.0)` (existing).
- Produces: `fill(template, seeds, wordlist, seed_value, min_seeds=10, deadline_s=10.0, prefilled: dict[str, str] | None = None) -> FillResult | FillFailure`. `prefilled` maps slot key (`"1A"`) → exact word. A prefilled slot is fixed to that word; mismatched length or unknown key → `FillFailure`. Entries whose slot was prefilled get `provenance="manual"`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_solver_prefilled.py
from app.solver.index import Wordlist
from app.solver.model import build_constraints
from app.solver.run import FillFailure, FillResult, fill
from app.solver.templates import Template


def _open_5x5() -> Template:
    # A 5x5 with one centre block pair: rows of 5 -> across slots length 5 & 2 etc.
    # Keep it fully open (no blocks) so every row/col is a length-5 slot.
    return Template(id="t5", rows=5, cols=5, blocks=frozenset())


def _slot_key(con) -> str:
    return f"{con.number}{'A' if con.direction == 'across' else 'D'}"


def test_prefilled_slot_is_honored():
    t = _open_5x5()
    cons = build_constraints(t)
    # words: all 5-letter Georgian strings; build a wordlist that can fill a 5x5.
    words = ["აბგდე", "ვზთიკ", "ლმნოპ", "ჟრსტუ", "ფქღყშ",
             "აველჟფ", ]  # placeholder; replaced below
    # Build a guaranteed-solvable 5x5 latin-square-like set over 5 Georgian letters.
    letters = "აბგდე"
    rows = ["".join(letters[(i + j) % 5] for j in range(5)) for i in range(5)]
    cols = ["".join(rows[i][j] for i in range(5)) for j in range(5)]
    wl = Wordlist(rows + cols)
    # Pick the across slot at the top row (number for (0,0) across) and pin it.
    top = next(c for c in cons if c.direction == "across" and c.cells[0] == (0, 0))
    res = fill(t, [], wl, seed_value=0, min_seeds=0, prefilled={_slot_key(top): rows[0]})
    assert isinstance(res, FillResult)
    pinned = next(e for e in res.entries if e.row == 0 and e.col == 0 and e.direction == "across")
    assert pinned.answer == rows[0]
    assert pinned.provenance == "manual"


def test_prefilled_wrong_length_fails():
    t = _open_5x5()
    cons = build_constraints(t)
    top = next(c for c in cons if c.direction == "across" and c.cells[0] == (0, 0))
    res = fill(t, [], Wordlist(["აბგდე"]), seed_value=0, min_seeds=0,
               prefilled={f"{top.number}A": "აბ"})
    assert isinstance(res, FillFailure)
    assert "length" in res.reason


def test_unknown_slot_key_fails():
    t = _open_5x5()
    res = fill(t, [], Wordlist(["აბგდე"]), seed_value=0, min_seeds=0, prefilled={"999A": "აბგდე"})
    assert isinstance(res, FillFailure)
    assert "unknown slot" in res.reason
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_solver_prefilled.py -v`
Expected: FAIL — `fill()` has no `prefilled` parameter (TypeError).

- [ ] **Step 3: Implement `prefilled` in `fill()`**

In `backend/app/solver/run.py`, change the signature and body. Replace the existing `fill(...)` definition through the `pools` construction with:

```python
def fill(
    template: Template,
    seeds: list[str],
    wordlist: Wordlist,
    seed_value: int,
    min_seeds: int = 10,
    deadline_s: float = 10.0,
    prefilled: dict[str, str] | None = None,
) -> FillResult | FillFailure:
    constraints = build_constraints(template)
    order = fill_order(constraints)
    bp = bound_positions(constraints, order)

    # Map slot key ("1A"/"3D") -> constraint index, for pre-filled slots.
    key_to_idx = {
        f"{c.number}{'A' if c.direction == 'across' else 'D'}": i
        for i, c in enumerate(constraints)
    }
    pre_idx: dict[int, str] = {}
    for key, word in (prefilled or {}).items():
        if key not in key_to_idx:
            return FillFailure(reason=f"unknown slot {key}")
        i = key_to_idx[key]
        if len(word) != constraints[i].length:
            return FillFailure(
                reason=f"prefilled {key} length {len(word)} != slot length {constraints[i].length}"
            )
        pre_idx[i] = word

    seed_set = set(seeds)
    seed_slots = set(choose_seed_slots(constraints, template.rows, template.cols, min_seeds))
    seed_slots -= pre_idx.keys()  # a pinned slot is never a reserved seed slot

    seeds_by_len: dict[int, list[str]] = {}
    for w in sorted(seed_set):
        seeds_by_len.setdefault(len(w), []).append(w)

    pools: dict[int, list[str]] = {}
    for i, con in enumerate(constraints):
        if i in pre_idx:
            pools[i] = [pre_idx[i]]  # singleton domain => the backtracker fixes it
        elif i in seed_slots:
            pool = seeds_by_len.get(con.length, [])
            if not pool:
                return FillFailure(reason=f"no seed word of length {con.length} for slot {con.number}")
            pools[i] = pool
        else:
            pools[i] = wordlist.by_length(con.length)

    if len(seed_slots) < min_seeds:
        return FillFailure(reason=f"only {len(seed_slots)} seed slots available, need {min_seeds}")
```

Then leave the `backtrack_fill(...)` call unchanged, and update the entry-building loop's `provenance` to recognise pinned slots:

```python
    entries = []
    for i, con in enumerate(constraints):
        answer = "".join(assignment[cell] for cell in con.cells)
        if i in pre_idx:
            prov = "manual"
        elif answer in seed_set:
            prov = "sourced"
        else:
            prov = "general-fill"
        entries.append(
            FilledEntry(
                number=con.number,
                direction=con.direction,
                row=con.cells[0][0],
                col=con.cells[0][1],
                answer=answer,
                provenance=prov,
            )
        )
    return FillResult(template_id=template.id, grid=assignment, entries=entries)
```

(The `for con in constraints` loop becomes `for i, con in enumerate(constraints)`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_solver_prefilled.py -v`
Expected: PASS (3 tests).

- [ ] **Step 5: Confirm no regression**

Run: `cd backend && uv run pytest -m "not perf" -q`
Expected: all pass (existing solver tests unaffected — `prefilled` defaults to `None`).

- [ ] **Step 6: Commit**

```bash
git add backend/app/solver/run.py backend/tests/test_solver_prefilled.py
git commit -m "feat(solver): pre-filled slots — fix specific slots to a word, fill the rest"
```

---

# Phase B — Backend services & endpoints for CREATE

### Task B1: `list_template_dtos()` + `GET /api/admin/templates`

**Files:**
- Modify: `backend/app/services/solver_jobs.py`, `backend/app/routers/admin.py`
- Test: `backend/tests/test_admin_templates.py`

**Interfaces:**
- Produces: `solver_jobs.list_template_dtos() -> list[dict]`, each `{"id", "rows", "cols", "blocks": [[r,c]...], "slots": [{"number", "direction", "row", "col", "length"}]}`. Endpoint `GET /api/admin/templates` returns that list.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_admin_templates.py
def test_list_templates(client):
    res = client.get("/api/admin/templates")
    assert res.status_code == 200
    data = res.json()
    assert len(data) >= 1
    t = data[0]
    assert {"id", "rows", "cols", "blocks", "slots"} <= t.keys()
    assert t["rows"] == 11 and t["cols"] == 11
    slot = t["slots"][0]
    assert {"number", "direction", "row", "col", "length"} <= slot.keys()
    assert slot["direction"] in ("across", "down")
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && uv run pytest tests/test_admin_templates.py -v`
Expected: FAIL — 404 (route missing).

- [ ] **Step 3: Implement the service helper**

Add to `backend/app/services/solver_jobs.py` (it already has `_LIB_DIR`, `load_library`, `build_constraints` is in `app.solver.model`):

```python
from app.solver.model import build_constraints


def list_template_dtos() -> list[dict]:
    out = []
    for t in load_library(_LIB_DIR):
        slots = []
        for con in build_constraints(t):
            r0, c0 = con.cells[0]
            slots.append({
                "number": con.number,
                "direction": con.direction,
                "row": r0,
                "col": c0,
                "length": con.length,
            })
        out.append({
            "id": t.id,
            "rows": t.rows,
            "cols": t.cols,
            "blocks": sorted([r, c] for (r, c) in t.blocks),
            "slots": slots,
        })
    return out
```

- [ ] **Step 4: Implement the endpoint**

Add to `backend/app/routers/admin.py` (import near the other service imports: `from app.services.solver_jobs import enqueue_fill, list_template_dtos`):

```python
@router.get("/templates")
def templates():
    return list_template_dtos()
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd backend && uv run pytest tests/test_admin_templates.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/solver_jobs.py backend/app/routers/admin.py backend/tests/test_admin_templates.py
git commit -m "feat(admin): GET /templates with per-slot geometry for CREATE"
```

---

### Task B2: fill job accepts `template_id` + `prefilled`

**Files:**
- Modify: `backend/app/services/solver_jobs.py`, `backend/app/routers/admin.py`
- Test: `backend/tests/test_admin_fill_prefilled.py`

**Interfaces:**
- Produces:
  - `enqueue_fill(db, puzzle_id, seed_value, min_seeds, template_id: str | None = None, prefilled: dict[str, str] | None = None) -> Job` — stores `template_id`/`prefilled` in `job.params`.
  - `run_fill_job` uses `params["template_id"]` (falls back to `pick_template`) and passes `params["prefilled"]` to `fill()`.
  - `FillRequest` gains `template_id: str | None = None` and `prefilled: dict[str, str] = {}`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_admin_fill_prefilled.py
import uuid

from app.models import Puzzle
from app.services.solver_jobs import enqueue_fill


def test_enqueue_fill_stores_template_and_prefilled(db_session):
    p = Puzzle(id=uuid.uuid4(), live_date=__import__("datetime").date(2026, 7, 1),
               theme="t", grid_template={}, status="draft", seed=None, version=1)
    db_session.add(p)
    db_session.flush()
    job = enqueue_fill(db_session, p.id, seed_value=0, min_seeds=0,
                       template_id="11x11-001", prefilled={"1A": "დედა"})
    assert job.params["template_id"] == "11x11-001"
    assert job.params["prefilled"] == {"1A": "დედა"}
    assert job.params["min_seeds"] == 0
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && uv run pytest tests/test_admin_fill_prefilled.py -v`
Expected: FAIL — `enqueue_fill()` has no `template_id`/`prefilled`.

- [ ] **Step 3: Implement**

In `backend/app/services/solver_jobs.py` replace `enqueue_fill` and the template selection in `run_fill_job`:

```python
def enqueue_fill(
    db: Session,
    puzzle_id: uuid.UUID,
    seed_value: int,
    min_seeds: int,
    template_id: str | None = None,
    prefilled: dict[str, str] | None = None,
) -> Job:
    job = Job(
        id=uuid.uuid4(), kind="fill", puzzle_id=puzzle_id, status="pending",
        params={
            "seed_value": seed_value,
            "min_seeds": min_seeds,
            "template_id": template_id,
            "prefilled": prefilled or {},
        },
    )
    db.add(job)
    db.flush()
    return job
```

In `run_fill_job`, replace the `template = pick_template(...)` line and the `fill(...)` call:

```python
    tid = job.params.get("template_id")
    template = next((t for t in library if t.id == tid), None) if tid else None
    if template is None:
        template = pick_template(library, job.params["seed_value"])
    outcome = fill(
        template, seeds, wordlist,
        seed_value=job.params["seed_value"], min_seeds=job.params["min_seeds"],
        prefilled=job.params.get("prefilled") or {},
    )
```

(Add `prefilled` to the `fill` import-time signature is already done in Phase A.)

- [ ] **Step 4: Extend `FillRequest` + endpoint**

In `backend/app/routers/admin.py`:

```python
class FillRequest(BaseModel):
    seed_value: int = 0
    min_seeds: int = 10
    template_id: str | None = None
    prefilled: dict[str, str] = {}


@router.post("/puzzles/{puzzle_id}/fill", status_code=202)
def request_fill(puzzle_id: uuid.UUID, body: FillRequest, db: Session = Depends(get_db)):
    if db.get(Puzzle, puzzle_id) is None:
        raise HTTPException(404, "puzzle not found")
    job = enqueue_fill(db, puzzle_id, body.seed_value, body.min_seeds,
                       template_id=body.template_id, prefilled=body.prefilled)
    db.commit()
    return {"job_id": str(job.id)}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd backend && uv run pytest tests/test_admin_fill_prefilled.py -v`
Expected: PASS.

- [ ] **Step 6: Confirm no regression**

Run: `cd backend && uv run pytest -m "not perf" -q`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/solver_jobs.py backend/app/routers/admin.py backend/tests/test_admin_fill_prefilled.py
git commit -m "feat(admin): fill job honors chosen template_id + pre-filled slots"
```

---

# Phase C — Backend: LIST data + AI word-check

### Task C1: `list_all()` + `GET /api/admin/puzzles`

**Files:**
- Modify: `backend/app/services/puzzles.py`, `backend/app/routers/admin.py`
- Test: `backend/tests/test_admin_list_puzzles.py`

**Interfaces:**
- Produces: `puzzles.list_all(db) -> list[Puzzle]` (all statuses, `live_date desc, id asc`). Endpoint `GET /api/admin/puzzles` → `[{"id","theme","live_date","status","entry_count"}]`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_admin_list_puzzles.py
import datetime as dt
import uuid

from app.models import Entry, Puzzle


def _mk(db, status, day):
    p = Puzzle(id=uuid.uuid4(), live_date=dt.date(2026, 7, day), theme=f"th{day}",
               grid_template={}, status=status, seed=None, version=1)
    db.add(p)
    db.flush()
    db.add(Entry(id=uuid.uuid4(), puzzle_id=p.id, number=1, direction="across",
                 answer="დედა", row=0, col=0, clue=None, clue_status="pending",
                 provenance="manual"))
    db.flush()
    return p


def test_list_all_puzzles_any_status(client, db_session):
    _mk(db_session, "draft", 1)
    _mk(db_session, "published", 2)
    res = client.get("/api/admin/puzzles")
    assert res.status_code == 200
    rows = res.json()
    statuses = {r["status"] for r in rows}
    assert {"draft", "published"} <= statuses
    assert all(r["entry_count"] == 1 for r in rows)
    assert rows[0]["live_date"] >= rows[-1]["live_date"]  # desc
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && uv run pytest tests/test_admin_list_puzzles.py -v`
Expected: FAIL — 404.

- [ ] **Step 3: Implement service**

Add to `backend/app/services/puzzles.py`:

```python
def list_all(db: Session) -> list[Puzzle]:
    stmt = select(Puzzle).order_by(Puzzle.live_date.desc(), Puzzle.id)
    return list(db.scalars(stmt))
```

- [ ] **Step 4: Implement endpoint**

In `backend/app/routers/admin.py` (import `from app.services.puzzles import list_all, today_tbilisi`):

```python
@router.get("/puzzles")
def list_puzzles(db: Session = Depends(get_db)):
    return [
        {
            "id": str(p.id),
            "theme": p.theme,
            "live_date": p.live_date.isoformat(),
            "status": p.status,
            "entry_count": len(p.entries),
        }
        for p in list_all(db)
    ]
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd backend && uv run pytest tests/test_admin_list_puzzles.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/puzzles.py backend/app/routers/admin.py backend/tests/test_admin_list_puzzles.py
git commit -m "feat(admin): GET /puzzles lists all crosswords (any status)"
```

---

### Task C2: AI `check_word` contract + Gemini impl

**Files:**
- Modify: `backend/app/ai/client.py`, `backend/app/ai/gemini.py`
- Test: `backend/tests/test_gemini_check_word.py`

**Interfaces:**
- Produces: `WordCheck(BaseModel){valid: bool, replacement: str | None = None}` in `app.ai.client`; protocol method `check_word(self, word: str, pattern: str, length: int) -> WordCheck`. `GeminiExtractor.check_word` calls the **suggest** model and parses one JSON object.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_gemini_check_word.py
import json

from app.ai.client import WordCheck
from app.ai.gemini import GeminiExtractor


class _Resp:
    def __init__(self, text): self.text = text


def test_check_word_parses_object():
    captured = {}

    def transport(model, prompt, schema):
        captured["model"] = model
        captured["prompt"] = prompt
        return _Resp(json.dumps({"valid": False, "replacement": "დედამიწა"}))

    ai = GeminiExtractor(api_key="x", extract_model="e", suggest_model="s",
                         clue_model="c", transport=transport)
    out = ai.check_word("ზზზზზზზზ", "__დ_____", 8)
    assert isinstance(out, WordCheck)
    assert out.valid is False
    assert out.replacement == "დედამიწა"
    assert captured["model"] == "s"  # uses the SUGGEST model
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && uv run pytest tests/test_gemini_check_word.py -v`
Expected: FAIL — `WordCheck` / `check_word` undefined.

- [ ] **Step 3: Implement the contract**

In `backend/app/ai/client.py` add the model and protocol method:

```python
class WordCheck(BaseModel):
    valid: bool
    replacement: str | None = None
```

and inside `class GeminiClient(Protocol):` add:

```python
    def check_word(self, word: str, pattern: str, length: int) -> WordCheck: ...
```

- [ ] **Step 4: Implement in Gemini**

In `backend/app/ai/gemini.py` import `WordCheck` (extend the existing import line) and add a method to `GeminiExtractor`:

```python
    def check_word(self, word, pattern, length) -> WordCheck:
        prompt = (
            f"შეამოწმე, არის თუ არა '{word}' გამართული ქართული სიტყვა. "
            f"თუ არ არის, შემოგვთავაზე {length}-ასოიანი გამართული ქართული სიტყვა, "
            f"რომელიც ზუსტად შეესაბამება შაბლონს '{pattern}' "
            f"(სადაც '_' ნებისმიერი ასოა, დანარჩენი ასოები უცვლელია). "
            f'დააბრუნე მხოლოდ JSON ობიექტი: {{"valid": true|false, "replacement": "სიტყვა"|null}}.'
        )
        for attempt in range(2):
            resp = self._call(self.suggest_model, prompt, WordCheck)
            try:
                return WordCheck(**json.loads(resp.text))
            except (json.JSONDecodeError, ValidationError, TypeError):
                if attempt == 1:
                    raise AIError("word check returned malformed JSON")
        raise AIError("unreachable")
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd backend && uv run pytest tests/test_gemini_check_word.py -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/ai/client.py backend/app/ai/gemini.py backend/tests/test_gemini_check_word.py
git commit -m "feat(ai): check_word (suggest model) — validity + crossing-aware replacement"
```

---

### Task C3: `block_word()` wordlist helper

**Files:**
- Modify: `backend/app/services/wordlist.py`
- Test: `backend/tests/test_wordlist_block.py`

**Interfaces:**
- Produces: `wordlist.block_word(db, word: str) -> WordlistEntry` — sets an existing entry's `status="blocked"`, or inserts it as blocked if absent.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_wordlist_block.py
from app.services.wordlist import add_word, block_word, list_words


def test_block_existing_word(db_session):
    add_word(db_session, "დედანი")
    row = block_word(db_session, "დედანი")
    assert row.status == "blocked"
    assert [w.word for w in list_words(db_session, status="active")] == []


def test_block_absent_word_inserts_blocked(db_session):
    row = block_word(db_session, "ზზზზზ")
    assert row.status == "blocked"
    assert row.length == 5
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && uv run pytest tests/test_wordlist_block.py -v`
Expected: FAIL — `block_word` undefined.

- [ ] **Step 3: Implement**

Add to `backend/app/services/wordlist.py`:

```python
def block_word(db: Session, word: str) -> WordlistEntry:
    row = db.scalar(select(WordlistEntry).where(WordlistEntry.word == word))
    if row is None:
        row = WordlistEntry(id=uuid.uuid4(), word=word, length=len(word), status="blocked")
        db.add(row)
    else:
        row.status = "blocked"
    db.flush()
    return row
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && uv run pytest tests/test_wordlist_block.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/wordlist.py backend/tests/test_wordlist_block.py
git commit -m "feat(wordlist): block_word — upsert a word to blocked status"
```

---

### Task C4: `word_check` service (pattern + check + fix)

**Files:**
- Create: `backend/app/services/word_check.py`
- Test: `backend/tests/test_word_check.py`

**Interfaces:**
- Consumes: `WordCheck`/`GeminiClient` (Task C2), `block_word`/`add_word` (wordlist), `is_georgian_word` (`app.sourcing.validate`).
- Produces:
  - `entry_pattern(puzzle, entry) -> str` — for the entry's cells, keep the letter at every **checked** cell (≥2 entries cross it), `"_"` at unchecked cells.
  - `check_and_fix_entry(db, puzzle, entry, ai) -> dict` → `{"valid": bool, "replaced_with": str | None}`. On invalid: blocks `entry.answer`; if the AI replacement fits the pattern + is Georgian, adds it to the wordlist (active) and sets `entry.answer = replacement`.
  - `check_puzzle(db, puzzle, ai) -> dict` → `{"checked": int, "invalid": int, "replaced": [{"number","direction","old","new"}]}`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_word_check.py
import datetime as dt
import uuid

from app.ai.client import WordCheck
from app.models import Entry, Puzzle, WordlistEntry
from app.services.word_check import check_and_fix_entry, check_puzzle, entry_pattern
from sqlalchemy import select


class FakeAI:
    """Returns a preset WordCheck per word; defaults to valid."""
    def __init__(self, verdicts): self.verdicts = verdicts
    def check_word(self, word, pattern, length): return self.verdicts.get(word, WordCheck(valid=True))


def _puzzle_with_cross(db):
    # 1A "დედა" at (0,0) across; 1D "დ..." crossing at (0,0) so col 0 is checked.
    p = Puzzle(id=uuid.uuid4(), live_date=dt.date(2026, 7, 1), theme="t",
               grid_template={}, status="draft", seed=None, version=1)
    db.add(p); db.flush()
    across = Entry(id=uuid.uuid4(), puzzle_id=p.id, number=1, direction="across",
                   answer="დედა", row=0, col=0, clue=None, clue_status="pending", provenance="manual")
    down = Entry(id=uuid.uuid4(), puzzle_id=p.id, number=1, direction="down",
                 answer="დათვი", row=0, col=0, clue=None, clue_status="pending", provenance="manual")
    db.add_all([across, down]); db.flush()
    return p, across, down


def test_pattern_keeps_checked_cells(db_session):
    p, across, _ = _puzzle_with_cross(db_session)
    # across "დედა": cell (0,0) is crossed by the down entry -> kept; others unchecked.
    assert entry_pattern(p, across) == "დ___"


def test_invalid_word_blocked_and_replaced(db_session):
    p, across, _ = _puzzle_with_cross(db_session)
    ai = FakeAI({"დედა": WordCheck(valid=False, replacement="დილა")})  # fits "დ___"
    out = check_and_fix_entry(db_session, p, across, ai)
    assert out == {"valid": False, "replaced_with": "დილა"}
    assert across.answer == "დილა"
    blocked = db_session.scalar(select(WordlistEntry).where(WordlistEntry.word == "დედა"))
    assert blocked.status == "blocked"
    added = db_session.scalar(select(WordlistEntry).where(WordlistEntry.word == "დილა"))
    assert added.status == "active"


def test_replacement_violating_pattern_is_rejected(db_session):
    p, across, _ = _puzzle_with_cross(db_session)
    ai = FakeAI({"დედა": WordCheck(valid=False, replacement="მზერა")})  # breaks the "დ" prefix
    out = check_and_fix_entry(db_session, p, across, ai)
    assert out == {"valid": False, "replaced_with": None}
    assert across.answer == "დედა"  # unchanged


def test_check_puzzle_aggregates(db_session):
    p, across, down = _puzzle_with_cross(db_session)
    ai = FakeAI({"დათვი": WordCheck(valid=False, replacement="დანები")})  # wrong length -> rejected? len 6 vs 5
    out = check_puzzle(db_session, p, ai)
    assert out["checked"] == 2
    assert out["invalid"] == 1
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && uv run pytest tests/test_word_check.py -v`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the service**

Create `backend/app/services/word_check.py`:

```python
from collections import Counter

from sqlalchemy.orm import Session

from app.ai.client import GeminiClient
from app.models import Entry, Puzzle
from app.services.wordlist import add_word, block_word
from app.sourcing.validate import is_georgian_word


def _cells(entry: Entry) -> list[tuple[int, int]]:
    r, c = entry.row, entry.col
    out = []
    for _ in range(len(entry.answer)):
        out.append((r, c))
        if entry.direction == "across":
            c += 1
        else:
            r += 1
    return out


def entry_pattern(puzzle: Puzzle, entry: Entry) -> str:
    counts: Counter[tuple[int, int]] = Counter()
    for e in puzzle.entries:
        counts.update(_cells(e))
    chars = []
    for idx, cell in enumerate(_cells(entry)):
        chars.append(entry.answer[idx] if counts[cell] >= 2 else "_")
    return "".join(chars)


def _fits(word: str, pattern: str) -> bool:
    return len(word) == len(pattern) and all(p == "_" or p == ch for p, ch in zip(pattern, word))


def check_and_fix_entry(db: Session, puzzle: Puzzle, entry: Entry, ai: GeminiClient) -> dict:
    pattern = entry_pattern(puzzle, entry)
    verdict = ai.check_word(entry.answer, pattern, len(entry.answer))
    if verdict.valid:
        return {"valid": True, "replaced_with": None}
    block_word(db, entry.answer)
    repl = verdict.replacement
    if repl and _fits(repl, pattern) and is_georgian_word(repl):
        add_word(db, repl)
        entry.answer = repl
        db.flush()
        return {"valid": False, "replaced_with": repl}
    return {"valid": False, "replaced_with": None}


def check_puzzle(db: Session, puzzle: Puzzle, ai: GeminiClient) -> dict:
    replaced = []
    invalid = 0
    # snapshot entries first; we mutate answers as we go
    for entry in list(puzzle.entries):
        old = entry.answer
        out = check_and_fix_entry(db, puzzle, entry, ai)
        if not out["valid"]:
            invalid += 1
            if out["replaced_with"]:
                replaced.append({
                    "number": entry.number, "direction": entry.direction,
                    "old": old, "new": out["replaced_with"],
                })
    return {"checked": len(puzzle.entries), "invalid": invalid, "replaced": replaced}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && uv run pytest tests/test_word_check.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/word_check.py backend/tests/test_word_check.py
git commit -m "feat(admin): word_check service — AI validity, block + crossing-safe replace"
```

---

### Task C5: word-check endpoints (per-entry + per-puzzle)

**Files:**
- Modify: `backend/app/routers/admin.py`
- Test: `backend/tests/test_admin_word_check.py`

**Interfaces:**
- Produces:
  - `POST /api/admin/puzzles/{puzzle_id}/entries/{entry_id}/check` → `{"valid","replaced_with"}`.
  - `POST /api/admin/puzzles/{puzzle_id}/check-words` → `{"checked","invalid","replaced"}`.
  - Both use the `get_gemini` dependency (override in tests).

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_admin_word_check.py
import datetime as dt
import uuid

from app.ai.client import WordCheck
from app.main import app
from app.models import Entry, Puzzle
from app.routers.admin import get_gemini


class FakeAI:
    def __init__(self, verdicts): self.verdicts = verdicts
    def check_word(self, word, pattern, length): return self.verdicts.get(word, WordCheck(valid=True))


def _seed(db):
    p = Puzzle(id=uuid.uuid4(), live_date=dt.date(2026, 7, 1), theme="t",
               grid_template={}, status="draft", seed=None, version=1)
    db.add(p); db.flush()
    e = Entry(id=uuid.uuid4(), puzzle_id=p.id, number=1, direction="across",
              answer="დედა", row=0, col=0, clue=None, clue_status="pending", provenance="manual")
    db.add(e); db.flush()
    return p, e


def test_check_entry_endpoint(client, db_session):
    p, e = _seed(db_session)
    app.dependency_overrides[get_gemini] = lambda: FakeAI({"დედა": WordCheck(valid=False, replacement="დ___".replace("_", "ა"))})
    try:
        res = client.post(f"/api/admin/puzzles/{p.id}/entries/{e.id}/check")
        assert res.status_code == 200
        body = res.json()
        assert body["valid"] is False
    finally:
        app.dependency_overrides.pop(get_gemini, None)


def test_check_words_endpoint(client, db_session):
    p, _ = _seed(db_session)
    app.dependency_overrides[get_gemini] = lambda: FakeAI({})  # all valid
    try:
        res = client.post(f"/api/admin/puzzles/{p.id}/check-words")
        assert res.status_code == 200
        assert res.json()["checked"] == 1
    finally:
        app.dependency_overrides.pop(get_gemini, None)
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && uv run pytest tests/test_admin_word_check.py -v`
Expected: FAIL — 404.

- [ ] **Step 3: Implement endpoints**

In `backend/app/routers/admin.py` import the service and add routes (place near the clue routes):

```python
from app.services.word_check import check_and_fix_entry, check_puzzle


@router.post("/puzzles/{puzzle_id}/entries/{entry_id}/check")
def check_entry(puzzle_id: uuid.UUID, entry_id: uuid.UUID,
                db: Session = Depends(get_db), ai: GeminiClient = Depends(get_gemini)):
    puzzle = db.get(Puzzle, puzzle_id)
    if puzzle is None:
        raise HTTPException(404, "puzzle not found")
    entry = db.get(Entry, entry_id)
    if entry is None or entry.puzzle_id != puzzle_id:
        raise HTTPException(404, "entry not found")
    out = check_and_fix_entry(db, puzzle, entry, ai)
    db.commit()
    return out


@router.post("/puzzles/{puzzle_id}/check-words")
def check_words(puzzle_id: uuid.UUID,
                db: Session = Depends(get_db), ai: GeminiClient = Depends(get_gemini)):
    puzzle = db.get(Puzzle, puzzle_id)
    if puzzle is None:
        raise HTTPException(404, "puzzle not found")
    out = check_puzzle(db, puzzle, ai)
    db.commit()
    return out
```

Add `Entry` to the `from app.models import ...` line.

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && uv run pytest tests/test_admin_word_check.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/admin.py backend/tests/test_admin_word_check.py
git commit -m "feat(admin): per-entry and per-puzzle AI word-check endpoints"
```

---

### Task C6: manual add-to-pool — `create_candidate()` + `POST /api/admin/pool`

**Files:**
- Modify: `backend/app/services/pool.py`, `backend/app/routers/admin.py`
- Test: `backend/tests/test_admin_pool_add.py`

**Interfaces:**
- Produces: `pool.create_candidate(db, surface: str, theme: str) -> WordCandidate` (status `"accepted"`, validated Georgian + length; raises `ValueError` on bad input or duplicate). Endpoint `POST /api/admin/pool {surface, theme}` → `{"id","surface","length","status"}`; 422 on `ValueError`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_admin_pool_add.py
def test_add_pool_word(client):
    res = client.post("/api/admin/pool", json={"surface": "დედამიწა", "theme": "გეო"})
    assert res.status_code == 201
    body = res.json()
    assert body["surface"] == "დედამიწა"
    assert body["status"] == "accepted"


def test_add_pool_word_rejects_non_georgian(client):
    res = client.post("/api/admin/pool", json={"surface": "hello", "theme": "გეო"})
    assert res.status_code == 422
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && uv run pytest tests/test_admin_pool_add.py -v`
Expected: FAIL — 404/405.

- [ ] **Step 3: Implement service**

Add to `backend/app/services/pool.py` (imports: `from app.sourcing.validate import is_georgian_word, valid_length`):

```python
def create_candidate(db: Session, surface: str, theme: str) -> WordCandidate:
    if not (is_georgian_word(surface) and valid_length(surface)):
        raise ValueError("invalid Georgian word (length 3-13)")
    existing = db.scalar(select(WordCandidate).where(WordCandidate.surface == surface))
    if existing is not None:
        raise ValueError("already in pool")
    row = WordCandidate(
        id=uuid.uuid4(), surface=surface, lemma=surface, length=len(surface),
        snippet=None, theme_tags=[theme], status="accepted",
    )
    db.add(row)
    db.flush()
    return row
```

- [ ] **Step 4: Implement endpoint**

In `backend/app/routers/admin.py` (import `create_candidate`; add a request model):

```python
class PoolAddRequest(BaseModel):
    surface: str
    theme: str


@router.post("/pool", status_code=201)
def pool_add(body: PoolAddRequest, db: Session = Depends(get_db)):
    try:
        row = create_candidate(db, body.surface.strip(), body.theme.strip())
    except ValueError as e:
        raise HTTPException(422, str(e))
    db.commit()
    return {"id": str(row.id), "surface": row.surface, "length": row.length, "status": row.status}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd backend && uv run pytest tests/test_admin_pool_add.py -v`
Expected: PASS.

- [ ] **Step 6: Full backend gate + commit**

Run: `cd backend && uv run pytest -m "not perf" -q`
Expected: all pass.

```bash
git add backend/app/services/pool.py backend/app/routers/admin.py backend/tests/test_admin_pool_add.py
git commit -m "feat(admin): POST /pool — manually add a themed candidate word"
```

---

# Phase D — Frontend: API client additions

### Task D1: extend `src/api/admin.ts`

**Files:**
- Modify: `frontend/src/api/admin.ts`
- Test: covered indirectly by page tests (D-phase pages). No standalone test for thin fetch wrappers.

**Interfaces:**
- Produces (raw async functions, matching existing style):
  - `listPuzzles(): Promise<PuzzleSummary[]>` — GET `/api/admin/puzzles` (`PuzzleSummary = {id, theme, live_date, status, entry_count}`).
  - `fetchTemplates(): Promise<TemplateDto[]>` — GET `/api/admin/templates` (`TemplateDto = {id, rows, cols, blocks:[number,number][], slots: SlotDto[]}`, `SlotDto = {number, direction:"across"|"down", row, col, length}`).
  - `requestFill(puzzleId, opts: {seedValue?: number; minSeeds?: number; templateId?: string; prefilled?: Record<string,string>})` — POST `/fill` (replaces the old positional `requestFill`).
  - `schedulePuzzle(id, liveDate): Promise<{status:string; live_date:string}>` — POST `/schedule`.
  - `checkEntry(puzzleId, entryId): Promise<{valid:boolean; replaced_with:string|null}>` — POST `/entries/{id}/check`.
  - `checkPuzzleWords(puzzleId): Promise<{checked:number; invalid:number; replaced:{number:number;direction:string;old:string;new:string}[]}>` — POST `/check-words`.
  - `addPoolWord(surface, theme): Promise<PoolWord>` — POST `/pool`.

- [ ] **Step 1: Add the functions**

Append to `frontend/src/api/admin.ts` (reuse the existing fetch-error helper used by the other wrappers — call it the same way the current functions do; mirror their `await fetch(...); if (!res.ok) throw ...; return res.json()` shape):

```typescript
export interface PuzzleSummary {
  id: string;
  theme: string;
  live_date: string;
  status: string;
  entry_count: number;
}

export interface SlotDto {
  number: number;
  direction: "across" | "down";
  row: number;
  col: number;
  length: number;
}

export interface TemplateDto {
  id: string;
  rows: number;
  cols: number;
  blocks: [number, number][];
  slots: SlotDto[];
}

export async function listPuzzles(): Promise<PuzzleSummary[]> {
  const res = await fetch("/api/admin/puzzles");
  if (!res.ok) throw new Error("failed to list puzzles");
  return res.json();
}

export async function fetchTemplates(): Promise<TemplateDto[]> {
  const res = await fetch("/api/admin/templates");
  if (!res.ok) throw new Error("failed to fetch templates");
  return res.json();
}

export interface FillOpts {
  seedValue?: number;
  minSeeds?: number;
  templateId?: string;
  prefilled?: Record<string, string>;
}

export async function requestFill(puzzleId: string, opts: FillOpts = {}): Promise<{ job_id: string }> {
  const res = await fetch(`/api/admin/puzzles/${puzzleId}/fill`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      seed_value: opts.seedValue ?? 0,
      min_seeds: opts.minSeeds ?? 0,
      template_id: opts.templateId ?? null,
      prefilled: opts.prefilled ?? {},
    }),
  });
  if (!res.ok) throw new Error("failed to start fill");
  return res.json();
}

export async function schedulePuzzle(id: string, liveDate: string): Promise<{ status: string; live_date: string }> {
  const res = await fetch(`/api/admin/puzzles/${id}/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ live_date: liveDate }),
  });
  if (!res.ok) throw new Error("failed to schedule");
  return res.json();
}

export async function checkEntry(puzzleId: string, entryId: string): Promise<{ valid: boolean; replaced_with: string | null }> {
  const res = await fetch(`/api/admin/puzzles/${puzzleId}/entries/${entryId}/check`, { method: "POST" });
  if (!res.ok) throw new Error("failed to check entry");
  return res.json();
}

export async function checkPuzzleWords(puzzleId: string): Promise<{ checked: number; invalid: number; replaced: { number: number; direction: string; old: string; new: string }[] }> {
  const res = await fetch(`/api/admin/puzzles/${puzzleId}/check-words`, { method: "POST" });
  if (!res.ok) throw new Error("failed to check words");
  return res.json();
}

export async function addPoolWord(surface: string, theme: string): Promise<{ id: string; surface: string; length: number; status: string }> {
  const res = await fetch("/api/admin/pool", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ surface, theme }),
  });
  if (!res.ok) throw new Error("failed to add pool word");
  return res.json();
}
```

> Note: the existing `requestFill(puzzleId, seedValue, minSeeds)` (positional) is replaced by the `opts` form. Task E2 updates its only caller (`PuzzleBuilder`). If any other caller exists, update it in this step.

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors (after Task E2 updates the caller; if you run before E2 you'll see the old `PuzzleBuilder` call mismatch — that's expected and fixed in E2).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/admin.ts
git commit -m "feat(admin-ui): api client — puzzles list, templates, schedule, word-check, pool add"
```

---

# Phase E — Frontend: routes & pages

### Task E1: nested routes + shell

**Files:**
- Modify: `frontend/src/router.tsx`, `frontend/src/pages/AdminApp.tsx`
- Test: `frontend/src/pages/__test__/AdminApp.test.tsx` (rewrite)

**Interfaces:**
- Produces routes: `/admin` (index → `PuzzleListAdmin`), `/admin/create` (→ `PuzzleBuilder`), `/admin/wordpool` (→ `WordPool`), `/admin/puzzles/$puzzleId` (→ `PuzzleDetail`). `AdminApp` renders nav `<Link>`s + `<Outlet/>`.

- [ ] **Step 1: Rewrite the shell**

Replace `frontend/src/pages/AdminApp.tsx` with:

```tsx
import { Link, Outlet } from "@tanstack/react-router";
import { PageHeader } from "../components/PageHeader"; // keep whatever the current import is

const NAV: { to: string; label: string }[] = [
  { to: "/admin", label: "სია" },        // LIST
  { to: "/admin/create", label: "შექმნა" }, // CREATE
  { to: "/admin/wordpool", label: "პული" }, // WORDPOOL
];

export function AdminApp() {
  return (
    <div className="mx-auto max-w-[760px] px-5 pt-8 pb-16">
      <PageHeader title="რედაქცია" eyebrow="ადმინისტრირება" />
      <nav className="mb-6 flex gap-1 border-b border-rule">
        {NAV.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            activeOptions={{ exact: n.to === "/admin" }}
            className="cursor-pointer border-0 border-b-2 border-transparent px-3 py-2 text-sm text-ink-soft hover:text-ink [&.active]:border-b-ochre [&.active]:text-ink"
          >
            {n.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
```

(Keep `PageHeader`'s real import path as it is in the current file.)

- [ ] **Step 2: Wire child routes**

In `frontend/src/router.tsx`, replace the `adminRoute` definition and its registration:

```tsx
import { PuzzleListAdmin } from "./pages/PuzzleListAdmin";
import { PuzzleBuilder } from "./pages/PuzzleBuilder";
import { WordPool } from "./pages/WordPool";
import { PuzzleDetail } from "./pages/PuzzleDetail";

const adminRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin", component: AdminApp });
const adminIndexRoute = createRoute({ getParentRoute: () => adminRoute, path: "/", component: PuzzleListAdmin });
const adminCreateRoute = createRoute({ getParentRoute: () => adminRoute, path: "create", component: PuzzleBuilder });
const adminWordpoolRoute = createRoute({ getParentRoute: () => adminRoute, path: "wordpool", component: WordPool });
const adminDetailRoute = createRoute({ getParentRoute: () => adminRoute, path: "puzzles/$puzzleId", component: PuzzleDetail });

const adminTree = adminRoute.addChildren([adminIndexRoute, adminCreateRoute, adminWordpoolRoute, adminDetailRoute]);

const routeTree = rootRoute.addChildren([indexRoute, playRoute, listRoute, adminTree]);
```

> The page imports (`PuzzleListAdmin`, `WordPool`, `PuzzleDetail`) don't exist until Tasks E3–E5. To keep the tree compiling, create stub files first (next step), then flesh them out.

- [ ] **Step 3: Create stub pages so the router compiles**

Create minimal stubs (replaced in later tasks):

```tsx
// frontend/src/pages/PuzzleListAdmin.tsx
export function PuzzleListAdmin() { return <div>LIST</div>; }
```
```tsx
// frontend/src/pages/WordPool.tsx
export function WordPool() { return <div>WORDPOOL</div>; }
```
```tsx
// frontend/src/pages/PuzzleDetail.tsx
export function PuzzleDetail() { return <div>DETAIL</div>; }
```

- [ ] **Step 4: Rewrite the shell test**

Replace `frontend/src/pages/__test__/AdminApp.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { router } from "../../router";

describe("AdminApp shell", () => {
  it("renders the three nav links at /admin", async () => {
    const history = createMemoryHistory({ initialEntries: ["/admin"] });
    router.update({ history });
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole("link", { name: "სია" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "შექმნა" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "პული" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run tests + type-check**

Run: `cd frontend && npm test -- AdminApp && npx tsc --noEmit`
Expected: AdminApp test passes; tsc clean.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/router.tsx frontend/src/pages/AdminApp.tsx frontend/src/pages/PuzzleListAdmin.tsx frontend/src/pages/WordPool.tsx frontend/src/pages/PuzzleDetail.tsx frontend/src/pages/__test__/AdminApp.test.tsx
git commit -m "feat(admin-ui): nested /admin routes (LIST/CREATE/WORDPOOL/detail) + shell"
```

---

### Task E2: CREATE — `PuzzleBuilder` rework (template + slot inputs + async fill)

**Files:**
- Modify: `frontend/src/pages/PuzzleBuilder.tsx`
- Test: `frontend/src/pages/__test__/PuzzleBuilder.test.tsx` (rewrite)

**Interfaces:**
- Consumes: `fetchTemplates`, `createPuzzle`, `requestFill` (opts form), `pollJob`, `fetchPuzzle` from `admin.ts`.
- Behaviour: pick a template (`<select>`); render one `<input>` per slot (`maxLength={slot.length}`); enter theme + live_date; **Generate** = `createPuzzle` → `requestFill(id,{templateId, prefilled, minSeeds:0})` → poll `pollJob` until `done`/`failed` → `fetchPuzzle` → show entries; on success show a `<Link to="/admin/puzzles/$puzzleId">` to view it in LIST.

- [ ] **Step 1: Rewrite the test**

Replace `frontend/src/pages/__test__/PuzzleBuilder.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { router } from "../../router";

function mockFetch(handlers: Record<string, (init?: RequestInit) => unknown>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const key = Object.keys(handlers).find((k) => url.includes(k));
    if (!key) throw new Error(`unmocked ${url}`);
    return { ok: true, json: async () => handlers[key](init) } as Response;
  }));
}

afterEach(() => vi.unstubAllGlobals());

const TEMPLATE = {
  id: "11x11-001", rows: 11, cols: 11, blocks: [],
  slots: [{ number: 1, direction: "across", row: 0, col: 0, length: 4 }],
};

describe("CREATE / PuzzleBuilder", () => {
  it("picks a template, types a slot word, generates, shows view link", async () => {
    mockFetch({
      "/api/admin/templates": () => [TEMPLATE],
      "/api/admin/puzzles/": () => ({ // fetchPuzzle detail
        id: "p1", theme: "t", live_date: "2026-07-01", status: "draft", grid_template: {},
        entries: [{ id: "e1", number: 1, direction: "across", answer: "დედა", row: 0, col: 0, clue: null, clue_status: "pending", provenance: "manual" }],
      }),
      "/api/admin/puzzles": () => ({ id: "p1", theme: "t", live_date: "2026-07-01", status: "draft" }), // createPuzzle
      "/fill": () => ({ job_id: "j1" }),
      "/api/admin/jobs/": () => ({ status: "done", result: { entries: 1 }, error: null }),
    });

    const history = createMemoryHistory({ initialEntries: ["/admin/create"] });
    router.update({ history });
    render(<RouterProvider router={router} />);

    const select = await screen.findByLabelText("შაბლონი");
    await userEvent.selectOptions(select, "11x11-001");
    const slotInput = await screen.findByLabelText("1 across");
    await userEvent.type(slotInput, "დედა");
    await userEvent.type(screen.getByLabelText("თემა"), "ტესტი");
    await userEvent.type(screen.getByLabelText("თარიღი"), "2026-07-01");
    await userEvent.click(screen.getByRole("button", { name: "გენერაცია" }));

    expect(await screen.findByText("დედა")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /სიაში ნახვა/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm test -- PuzzleBuilder`
Expected: FAIL — stub renders only "CREATE".

- [ ] **Step 3: Implement `PuzzleBuilder`**

Replace `frontend/src/pages/PuzzleBuilder.tsx`:

```tsx
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { DataTable } from "../components/DataTable";
import {
  createPuzzle, fetchPuzzle, fetchTemplates, pollJob, requestFill,
  type PuzzleDetail, type TemplateDto,
} from "../api/admin";

const slotKey = (s: { number: number; direction: string }) =>
  `${s.number}${s.direction === "across" ? "A" : "D"}`;

export function PuzzleBuilder() {
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [words, setWords] = useState<Record<string, string>>({});
  const [theme, setTheme] = useState("");
  const [liveDate, setLiveDate] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [puzzleId, setPuzzleId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PuzzleDetail | null>(null);

  useEffect(() => { fetchTemplates().then(setTemplates).catch(() => setError("failed to load templates")); }, []);
  const template = templates.find((t) => t.id === templateId);

  async function generate() {
    setError(null); setDetail(null); setStatus("creating");
    try {
      const prefilled = Object.fromEntries(
        Object.entries(words).filter(([, w]) => w.trim().length > 0)
      );
      const p = await createPuzzle(theme.trim(), liveDate);
      setPuzzleId(p.id);
      const { job_id } = await requestFill(p.id, { templateId, prefilled, minSeeds: 0 });
      setStatus("filling");
      for (;;) {
        const job = await pollJob(job_id);
        if (job.status === "done") break;
        if (job.status === "failed") { setError(job.error ?? "fill failed"); setStatus(null); return; }
        await new Promise((r) => setTimeout(r, 1000));
      }
      setDetail(await fetchPuzzle(p.id));
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "error"); setStatus(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span>შაბლონი</span>
        <select aria-label="შაბლონი" value={templateId} onChange={(e) => { setTemplateId(e.target.value); setWords({}); }}>
          <option value="">—</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.id}</option>)}
        </select>
      </label>

      {template && (
        <div className="grid grid-cols-2 gap-2">
          {template.slots.map((s) => (
            <label key={slotKey(s)} className="flex items-center gap-2 text-sm">
              <span className="w-20 text-ink-soft">{s.number} {s.direction}</span>
              <Input
                aria-label={`${s.number} ${s.direction}`}
                maxLength={s.length}
                value={words[slotKey(s)] ?? ""}
                onChange={(e) => setWords((w) => ({ ...w, [slotKey(s)]: e.target.value }))}
              />
            </label>
          ))}
        </div>
      )}

      <label className="flex flex-col gap-1 text-sm"><span>თემა</span>
        <Input aria-label="თემა" value={theme} onChange={(e) => setTheme(e.target.value)} /></label>
      <label className="flex flex-col gap-1 text-sm"><span>თარიღი</span>
        <Input aria-label="თარიღი" type="date" value={liveDate} onChange={(e) => setLiveDate(e.target.value)} /></label>

      <Button onClick={generate} disabled={!templateId || !theme.trim() || !liveDate || status === "filling" || status === "creating"}>
        გენერაცია
      </Button>

      {status && status !== "done" && <p className="text-sm text-ink-soft">{status}…</p>}
      {error && <p className="text-sm text-cinnabar">{error}</p>}

      {detail && (
        <>
          <DataTable
            columns={[{ key: "number", header: "#" }, { key: "direction", header: "მიმართ." },
                      { key: "answer", header: "სიტყვა" }, { key: "provenance", header: "წყარო" }]}
            rows={detail.entries}
          />
          {puzzleId && (
            <Link to="/admin/puzzles/$puzzleId" params={{ puzzleId }} className="text-ochre underline">
              სიაში ნახვა →
            </Link>
          )}
        </>
      )}
    </div>
  );
}
```

(The puzzle is persisted as a `draft` the moment Generate runs — that is the "save". The View link opens its LIST detail page. **Skipped:** a separate explicit "Save" button — there is nothing to save beyond the draft the fill already wrote; add one only if Generate should become non-persisting.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npm test -- PuzzleBuilder && npx tsc --noEmit`
Expected: PASS; tsc clean (the `requestFill` opts caller now matches Task D1).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/PuzzleBuilder.tsx frontend/src/pages/__test__/PuzzleBuilder.test.tsx
git commit -m "feat(admin-ui): CREATE flow — template + per-slot words + async generate + view link"
```

---

### Task E3: LIST — `PuzzleListAdmin`

**Files:**
- Modify: `frontend/src/pages/PuzzleListAdmin.tsx` (replace stub)
- Test: `frontend/src/pages/__test__/PuzzleListAdmin.test.tsx`

**Interfaces:**
- Consumes: `listPuzzles`. Renders a table of all puzzles; each row links to `/admin/puzzles/$puzzleId`.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/pages/__test__/PuzzleListAdmin.test.tsx
import { render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { router } from "../../router";

afterEach(() => vi.unstubAllGlobals());

describe("LIST / PuzzleListAdmin", () => {
  it("lists puzzles with status and a detail link", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => [
        { id: "p1", theme: "ალფა", live_date: "2026-07-02", status: "draft", entry_count: 30 },
        { id: "p2", theme: "ბეტა", live_date: "2026-07-01", status: "published", entry_count: 28 },
      ],
    } as Response)));
    const history = createMemoryHistory({ initialEntries: ["/admin"] });
    router.update({ history });
    render(<RouterProvider router={router} />);
    expect(await screen.findByText("ალფა")).toBeInTheDocument();
    expect(screen.getByText("published")).toBeInTheDocument();
    const link = screen.getAllByRole("link").find((a) => a.getAttribute("href")?.includes("/admin/puzzles/p1"));
    expect(link).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm test -- PuzzleListAdmin`
Expected: FAIL — stub renders "LIST".

- [ ] **Step 3: Implement**

```tsx
// frontend/src/pages/PuzzleListAdmin.tsx
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listPuzzles, type PuzzleSummary } from "../api/admin";
import { SectionTitle } from "../components/ui/Typography";

export function PuzzleListAdmin() {
  const [rows, setRows] = useState<PuzzleSummary[]>([]);
  useEffect(() => { listPuzzles().then(setRows).catch(() => setRows([])); }, []);
  return (
    <div className="flex flex-col gap-3">
      <SectionTitle>ჯვარედინები</SectionTitle>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-ink-soft">
          <th className="py-1">თემა</th><th>თარიღი</th><th>სტატუსი</th><th>სიტყვები</th><th />
        </tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-t border-rule">
              <td className="py-1">{p.theme}</td>
              <td>{p.live_date}</td>
              <td>{p.status}</td>
              <td>{p.entry_count}</td>
              <td>
                <Link to="/admin/puzzles/$puzzleId" params={{ puzzleId: p.id }} className="text-ochre underline">
                  გახსნა
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npm test -- PuzzleListAdmin && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/PuzzleListAdmin.tsx frontend/src/pages/__test__/PuzzleListAdmin.test.tsx
git commit -m "feat(admin-ui): LIST page — all crosswords with detail links"
```

---

### Task E4: LIST detail — `PuzzleDetail` (publish + per-entry/per-puzzle AI check)

**Files:**
- Modify: `frontend/src/pages/PuzzleDetail.tsx` (replace stub)
- Test: `frontend/src/pages/__test__/PuzzleDetail.test.tsx`

**Interfaces:**
- Consumes: `useParams` (from the `/admin/puzzles/$puzzleId` route), `fetchPuzzle`, `schedulePuzzle`, `checkEntry`, `checkPuzzleWords`.
- Behaviour: shows entries in a custom table (per-row "შემოწმება" button → `checkEntry`, shows ✓/replacement); a **"გამოქვეყნება" (publish)** control with a date input → `schedulePuzzle(id, date)` (sets status `scheduled`); a **"სიტყვების შემოწმება" (check all)** button → `checkPuzzleWords` then re-fetches.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/pages/__test__/PuzzleDetail.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { router } from "../../router";

afterEach(() => vi.unstubAllGlobals());

const DETAIL = {
  id: "p1", theme: "ალფა", live_date: "2026-07-02", status: "draft", grid_template: {},
  entries: [{ id: "e1", number: 1, direction: "across", answer: "დედა", row: 0, col: 0, clue: null, clue_status: "pending", provenance: "manual" }],
};

describe("DETAIL / PuzzleDetail", () => {
  it("checks a single entry word via AI", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/entries/") && url.includes("/check"))
        return { ok: true, json: async () => ({ valid: false, replaced_with: "დილა" }) } as Response;
      return { ok: true, json: async () => DETAIL } as Response;
    }));
    const history = createMemoryHistory({ initialEntries: ["/admin/puzzles/p1"] });
    router.update({ history });
    render(<RouterProvider router={router} />);
    await userEvent.click(await screen.findByRole("button", { name: "შემოწმება" }));
    expect(await screen.findByText(/დილა/)).toBeInTheDocument();
  });

  it("publishes (schedules) the puzzle", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes("/schedule")) return { ok: true, json: async () => ({ status: "scheduled", live_date: "2026-07-02" }) } as Response;
      return { ok: true, json: async () => DETAIL } as Response;
    }));
    const history = createMemoryHistory({ initialEntries: ["/admin/puzzles/p1"] });
    router.update({ history });
    render(<RouterProvider router={router} />);
    await userEvent.click(await screen.findByRole("button", { name: "გამოქვეყნება" }));
    await waitFor(() => expect(calls.some((u) => u.includes("/schedule"))).toBe(true));
    expect(await screen.findByText(/scheduled/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm test -- PuzzleDetail`
Expected: FAIL — stub renders "DETAIL".

- [ ] **Step 3: Implement**

```tsx
// frontend/src/pages/PuzzleDetail.tsx
import { useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { SectionTitle } from "../components/ui/Typography";
import {
  checkEntry, checkPuzzleWords, fetchPuzzle, schedulePuzzle, type PuzzleDetail as Detail,
} from "../api/admin";

export function PuzzleDetail() {
  const { puzzleId } = useParams({ from: "/admin/puzzles/$puzzleId" });
  const [detail, setDetail] = useState<Detail | null>(null);
  const [liveDate, setLiveDate] = useState("");
  const [pubStatus, setPubStatus] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({}); // entryId -> message
  const [busy, setBusy] = useState(false);

  async function load() {
    const d = await fetchPuzzle(puzzleId);
    setDetail(d);
    setLiveDate(d.live_date);
  }
  useEffect(() => { load(); }, [puzzleId]);

  async function publish() {
    setBusy(true);
    try {
      const r = await schedulePuzzle(puzzleId, liveDate);
      setPubStatus(r.status);
      await load();
    } finally { setBusy(false); }
  }

  async function checkOne(entryId: string) {
    const r = await checkEntry(puzzleId, entryId);
    setResults((m) => ({ ...m, [entryId]: r.valid ? "✓" : r.replaced_with ? `→ ${r.replaced_with}` : "✗" }));
    await load();
  }

  async function checkAll() {
    setBusy(true);
    try { await checkPuzzleWords(puzzleId); await load(); } finally { setBusy(false); }
  }

  if (!detail) return <p className="text-sm text-ink-soft">…</p>;

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle>{detail.theme}</SectionTitle>
      <p className="text-sm text-ink-soft">სტატუსი: {detail.status}{pubStatus ? ` → ${pubStatus}` : ""}</p>

      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm"><span>თარიღი</span>
          <Input type="date" value={liveDate} onChange={(e) => setLiveDate(e.target.value)} /></label>
        <Button onClick={publish} disabled={busy || !liveDate}>გამოქვეყნება</Button>
        <Button variant="ghost" onClick={checkAll} disabled={busy}>სიტყვების შემოწმება</Button>
      </div>

      <table className="w-full text-sm">
        <thead><tr className="text-left text-ink-soft">
          <th className="py-1">#</th><th>მიმართ.</th><th>სიტყვა</th><th>შედეგი</th><th />
        </tr></thead>
        <tbody>
          {detail.entries.map((e) => (
            <tr key={e.id} className="border-t border-rule">
              <td className="py-1">{e.number}</td>
              <td>{e.direction}</td>
              <td>{e.answer}</td>
              <td>{results[e.id] ?? ""}</td>
              <td><Button size="sm" variant="ghost" onClick={() => checkOne(e.id)}>შემოწმება</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npm test -- PuzzleDetail && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/PuzzleDetail.tsx frontend/src/pages/__test__/PuzzleDetail.test.tsx
git commit -m "feat(admin-ui): puzzle detail — publish (schedule) + per-entry/per-puzzle AI word-check"
```

---

### Task E5: WORDPOOL — `WordPool` (extract + manual add)

**Files:**
- Modify: `frontend/src/pages/WordPool.tsx` (replace stub)
- Test: `frontend/src/pages/__test__/WordPool.test.tsx`

**Interfaces:**
- Consumes: existing `extractText`, `bulkUpdate` (from `PoolReview`'s flow) + new `addPoolWord`.
- Behaviour: the existing extract-from-text UI (reuse `PoolReview`'s logic verbatim) **plus** a single-word add form (`surface` + `theme` → `addPoolWord`).

> DRY: rather than duplicate, render the existing `PoolReview` component and add the manual-add form above it. `PoolReview` already does extract + accept/reject.

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/src/pages/__test__/WordPool.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WordPool } from "../WordPool";

afterEach(() => vi.unstubAllGlobals());

describe("WORDPOOL / WordPool", () => {
  it("adds a word to the pool", async () => {
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: String(init?.body ?? "") });
      return { ok: true, json: async () => ({ id: "c1", surface: "დედამიწა", length: 8, status: "accepted" }) } as Response;
    }));
    render(<WordPool />);
    await userEvent.type(screen.getByLabelText("ახალი სიტყვა"), "დედამიწა");
    await userEvent.type(screen.getByLabelText("თემა (პული)"), "გეო");
    await userEvent.click(screen.getByRole("button", { name: "დამატება" }));
    expect(calls.some((c) => c.url.includes("/api/admin/pool") && c.body.includes("დედამიწა"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd frontend && npm test -- WordPool`
Expected: FAIL — stub renders "WORDPOOL".

- [ ] **Step 3: Implement**

```tsx
// frontend/src/pages/WordPool.tsx
import { useState } from "react";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { SectionTitle } from "../components/ui/Typography";
import { addPoolWord } from "../api/admin";
import { PoolReview } from "./PoolReview";

export function WordPool() {
  const [surface, setSurface] = useState("");
  const [theme, setTheme] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function add() {
    setMsg(null);
    try {
      const r = await addPoolWord(surface.trim(), theme.trim());
      setMsg(`დაემატა: ${r.surface}`);
      setSurface("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "error");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <SectionTitle>სიტყვის დამატება</SectionTitle>
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-sm"><span>ახალი სიტყვა</span>
            <Input aria-label="ახალი სიტყვა" value={surface} onChange={(e) => setSurface(e.target.value)} /></label>
          <label className="flex flex-col gap-1 text-sm"><span>თემა (პული)</span>
            <Input aria-label="თემა (პული)" value={theme} onChange={(e) => setTheme(e.target.value)} /></label>
          <Button onClick={add} disabled={!surface.trim() || !theme.trim()}>დამატება</Button>
        </div>
        {msg && <p className="text-sm text-ink-soft">{msg}</p>}
      </div>
      <PoolReview />
    </div>
  );
}
```

> `PoolReview` stays exactly as-is (extract + accept/reject). If `PoolReview` is not a named export, add `export` to its declaration in this step.

- [ ] **Step 4: Run to verify it passes**

Run: `cd frontend && npm test -- WordPool && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 5: Full frontend gate + commit**

Run: `cd frontend && npm test && npm run build`
Expected: all tests pass; build clean.

```bash
git add frontend/src/pages/WordPool.tsx frontend/src/pages/__test__/WordPool.test.tsx frontend/src/pages/PoolReview.tsx
git commit -m "feat(admin-ui): WORDPOOL page — manual add + existing extract flow"
```

---

# Phase F — Integration & docs

### Task F1: end-to-end smoke + CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Manual smoke (worker required for CREATE)**

In three terminals: `docker compose up -d`; `cd backend && uv run python -m app.worker`; `cd frontend && npm run dev`. Then:
1. `/admin/wordpool` → add a word; extract from text.
2. `/admin/create` → pick `11x11-001`, type a word into slot 1A, set theme + date, **გენერაცია** → entries appear → click **სიაში ნახვა**.
3. `/admin` (LIST) → see the draft → open it → **შემოწმება** on one entry (needs `GEMINI_API_KEY`) → **გამოქვეყნება** with a date → status becomes `scheduled`.

- [ ] **Step 2: Update CLAUDE.md**

Under the Frontend "Key layout" / Routes line, replace the admin route description with:

```markdown
- Routes (`src/router.tsx`): `/` Play (today), `/play?id=|date=` Play, `/list` published list, and `/admin` admin shell with **nested routes**: `/admin` (LIST — all crosswords + detail at `/admin/puzzles/$id` with publish + AI word-check), `/admin/create` (CREATE — template + per-slot words + async fill), `/admin/wordpool` (WORDPOOL — add + extract candidate words). The admin surface uses raw `fetch` wrappers in `src/api/admin.ts` (NOT react-query) + local `useState`.
```

Under "Generating a puzzle", add:

```markdown
- **CREATE via Admin:** `/admin/create` posts a draft, then a fill `Job` with `{template_id, prefilled, min_seeds:0}`. `prefilled` maps slot key (`"1A"`/`"3D"`) → exact word; the solver fixes those slots and fills the rest (`fill(..., prefilled=...)`). The worker must be running. Publish = `POST /schedule` (status `scheduled`; worker promotes on `live_date`).
- **AI word-check (LIST):** per-entry/per-puzzle `POST .../check` uses the SUGGEST model; an invalid answer is blocked in `wordlist_entries`, and a crossing-pattern-matching replacement is added (active) and written back to the entry. Greedy per-entry — see `services/word_check.py`.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: admin panel nested routes, CREATE pre-fill flow, AI word-check"
```

---

## Self-Review notes (coverage map)

- **3 subsections as separate routes** → Task E1 (router + shell).
- **LIST of all crosswords** → C1 (endpoint) + E3 (page).
- **Per-crossword publish button** → schedule endpoint (existing) wired in D1 + E4 (publish = schedule, per your choice).
- **Per-word + per-puzzle AI validity check; invalid → block in wordlist; valid replacement → add to wordlist; crossing-aware** → C2 (AI contract) + C3 (block) + C4 (service, pattern) + C5 (endpoints) + E4 (UI).
- **CREATE: choose template, fill specific slots, generate, save, view in LIST** → A1 (solver prefilled) + B1 (templates) + B2 (job) + E2 (page).
- **WORDPOOL: add words + existing extract** → C6 (add endpoint) + E5 (page reusing PoolReview).
- **Async fill via worker** → B2 + E2 honor the Job/poll path.

**Known simplifications (ponytail):** word-check is greedy per-entry (a cell shared by two invalid words keeps the first-seen checked letter); CREATE persists on Generate (no separate Save step); the 47k WordlistManager is dropped from nav (component retained). Each is called out at its task.
