# Admin Curation & Builder UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Give the admin a screen to curate the **global general-fill wordlist** and a screen to **create a draft puzzle, configure its theme/seeds, run a fill, and see the result** — tied together by a minimal admin shell that also hosts the existing pool-review screen.

**Architecture:** Thin additions on top of what already exists. The `WordlistEntry` and `Puzzle` models, the deterministic solver, the async fill `Job` + `/fill` + `/jobs/{id}` endpoints, the pool endpoints, and the reusable `<DataTable>` are **already built** — this plan adds a `wordlist` service + CRUD/stats endpoints, two `/puzzles` endpoints, three React screens, and a tab shell. No new backend dependency; the frontend gets no new dependency either (a `window.location.pathname` switch stands in for a router).

**Tech Stack:** Backend — Python 3.12, FastAPI, SQLAlchemy 2.0, `uv`, pytest. Frontend — React 18 + TypeScript, Vite, Vitest + Testing Library (raw `fetch`, no Tailwind).

## Global Constraints

- **Re-validate every word before it persists** (DESIGN.md §4.7): word ∈ U+10D0–U+10FF only, length 3–13. Reuse `app/sourcing/validate.py` (`is_georgian_word`, `valid_length`) — do not re-implement.
- **Wordlist statuses:** `WordlistEntry.status ∈ active | blocked`. Only `active` entries are loaded by the worker for fill (already implemented in `worker.load_active_wordlist`).
- **Puzzle statuses:** `Puzzle.status ∈ draft | scheduled | published`. This plan only creates `draft`s; scheduling/publishing is the Publishing plan.
- **Candidate→seed association is theme-based (current design):** `seeds_for_puzzle` matches `WordCandidate.theme_tags` against `Puzzle.theme`. This plan does **not** introduce a `puzzle_id` FK on candidates (that is open question Q1 in `docs/ADMIN_TDD.md §11`); creating a puzzle just sets its theme, and the existing worker wiring supplies seeds by theme.
- **Wordlist stats are display-only for MVP** (`ADMIN_TDD §11 Q3`): a per-length count histogram, no coverage targets/gating.
- **Admin auth is out of scope here.** `/api/admin/*` routes stay ungated; the Auth phase adds `require_admin` to all of them in one sweep. Do not add auth in this plan.
- **Answers are admin-only.** `GET /api/admin/puzzles/{id}` may return answers (admin surface); the Play API must never. Do not reuse this endpoint for Play.
- **TypeScript-only frontend**, `.ts`/`.tsx`; tests live in a `__test__/` folder beside the component and mock `fetch` via `vi.stubGlobal`.

## File Structure

```
backend/app/
├── services/wordlist.py          # NEW: WordlistEntry CRUD + bulk import + stats
└── routers/admin.py              # MODIFY: + /wordlist*, + /puzzles (create), + /puzzles/{id} (get)
backend/tests/
├── test_wordlist.py              # NEW: service unit/integration tests
├── test_admin_wordlist.py        # NEW: wordlist endpoint tests
└── test_admin_puzzles.py         # NEW: puzzle create/get endpoint tests
frontend/src/
├── api/admin.ts                  # MODIFY: + wordlist + puzzle/job client wrappers
├── components/
│   ├── WordlistManager.tsx       # NEW: curate the global fill wordlist
│   ├── PuzzleBuilder.tsx         # NEW: create draft → fill → poll → show result
│   ├── AdminApp.tsx              # NEW: tab shell (Pool / Wordlist / Build)
│   └── __test__/
│       ├── WordlistManager.test.tsx
│       ├── PuzzleBuilder.test.tsx
│       └── AdminApp.test.tsx
└── main.tsx                      # MODIFY: render AdminApp on /admin, PlayView otherwise
```

---

### Task 1: Wordlist service — CRUD, bulk import, stats

**Files:**
- Create: `backend/app/services/wordlist.py`
- Test: `backend/tests/test_wordlist.py`

**Interfaces:**
- Consumes: `WordlistEntry` (model, built); `is_georgian_word`, `valid_length` (`app/sourcing/validate.py`, built).
- Produces:
  - `wordlist.add_word(db: Session, word: str) -> WordlistEntry` — re-validates (raises `ValueError(reason)` if invalid), dedupes (returns the existing row if `word` already present), else inserts `active`.
  - `wordlist.list_words(db, status: str | None = None, length: int | None = None, search: str | None = None) -> list[WordlistEntry]` — ordered by `word`.
  - `wordlist.update_entry(db, entry_id: uuid.UUID, word: str | None = None, status: str | None = None) -> WordlistEntry` — sets status (`active|blocked`, else `ValueError`) and/or edits the word (re-validated); raises `ValueError("not found")` if missing.
  - `wordlist.bulk_import(db, words: list[str]) -> dict` — `{"added": int, "rejected": [{"word", "reason"}]}`; re-validates, dedupes against existing + within-batch.
  - `wordlist.stats(db) -> dict` — `{"active": int, "blocked": int, "by_length": {3..13 -> count}}` (active only, every length 3–13 present, zero-filled).

- [x] **Step 1: Write the failing tests**

`backend/tests/test_wordlist.py`:
```python
import uuid

import pytest

from app.models import WordlistEntry
from app.services.wordlist import add_word, bulk_import, list_words, stats, update_entry


def test_add_word_validates_and_inserts(db_session):
    row = add_word(db_session, "თბილისი")
    db_session.flush()
    assert row.length == 7 and row.status == "active"


def test_add_word_rejects_non_georgian(db_session):
    with pytest.raises(ValueError, match="non-georgian"):
        add_word(db_session, "abc")


def test_add_word_dedupes(db_session):
    a = add_word(db_session, "თბილისი")
    b = add_word(db_session, "თბილისი")
    db_session.flush()
    assert a.id == b.id


def test_update_entry_blocks_and_unblocks(db_session):
    row = add_word(db_session, "თბილისი")
    db_session.flush()
    update_entry(db_session, row.id, status="blocked")
    db_session.flush()
    assert row.status == "blocked"
    update_entry(db_session, row.id, status="active")
    db_session.flush()
    assert row.status == "active"


def test_update_entry_rejects_bad_status(db_session):
    row = add_word(db_session, "თბილისი")
    db_session.flush()
    with pytest.raises(ValueError, match="invalid status"):
        update_entry(db_session, row.id, status="zombie")


def test_bulk_import_counts_and_rejects(db_session):
    result = bulk_import(db_session, ["თბილისი", "ბათუმი", "ab", "თბილისი"])
    db_session.flush()
    assert result["added"] == 2  # two valid uniques; "ab" rejected, dup skipped
    reasons = {r["word"]: r["reason"] for r in result["rejected"]}
    assert reasons == {"ab": "length<3"}


def test_list_filters_by_status_and_search(db_session):
    add_word(db_session, "თბილისი")
    blocked = add_word(db_session, "ბათუმი")
    db_session.flush()
    update_entry(db_session, blocked.id, status="blocked")
    db_session.flush()
    assert [w.word for w in list_words(db_session, status="active")] == ["თბილისი"]
    assert [w.word for w in list_words(db_session, search="ბათ")] == ["ბათუმი"]


def test_stats_zero_fills_all_lengths(db_session):
    add_word(db_session, "აბგ")        # length 3
    add_word(db_session, "თბილისი")    # length 7
    db_session.flush()
    s = stats(db_session)
    assert s["active"] == 2 and s["blocked"] == 0
    assert s["by_length"][3] == 1 and s["by_length"][7] == 1
    assert s["by_length"][4] == 0
    assert set(s["by_length"].keys()) == set(range(3, 14))
```

- [x] **Step 2: Run to verify failure**

Run (from `backend/`): `uv run pytest tests/test_wordlist.py -v`
Expected: FAIL — `ModuleNotFoundError: app.services.wordlist`.

- [x] **Step 3: Implement the service**

`backend/app/services/wordlist.py`:
```python
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import WordlistEntry
from app.sourcing.validate import is_georgian_word, valid_length


def _reject_reason(word: str) -> str | None:
    if not is_georgian_word(word):
        return "non-georgian"
    if len(word) < 3:
        return "length<3"
    if len(word) > 13:
        return "length>13"
    return None


def add_word(db: Session, word: str) -> WordlistEntry:
    reason = _reject_reason(word)
    if reason is not None:
        raise ValueError(reason)
    existing = db.scalar(select(WordlistEntry).where(WordlistEntry.word == word))
    if existing is not None:
        return existing
    row = WordlistEntry(id=uuid.uuid4(), word=word, length=len(word), status="active")
    db.add(row)
    db.flush()
    return row


def list_words(
    db: Session, status: str | None = None, length: int | None = None, search: str | None = None
) -> list[WordlistEntry]:
    stmt = select(WordlistEntry)
    if status:
        stmt = stmt.where(WordlistEntry.status == status)
    if length:
        stmt = stmt.where(WordlistEntry.length == length)
    if search:
        stmt = stmt.where(WordlistEntry.word.contains(search))
    return list(db.scalars(stmt.order_by(WordlistEntry.word)))


def update_entry(
    db: Session, entry_id: uuid.UUID, word: str | None = None, status: str | None = None
) -> WordlistEntry:
    row = db.get(WordlistEntry, entry_id)
    if row is None:
        raise ValueError("not found")
    if status is not None:
        if status not in ("active", "blocked"):
            raise ValueError("invalid status")
        row.status = status
    if word is not None:
        reason = _reject_reason(word)
        if reason is not None:
            raise ValueError(reason)
        row.word = word
        row.length = len(word)
    db.flush()
    return row


def bulk_import(db: Session, words: list[str]) -> dict:
    existing = set(db.scalars(select(WordlistEntry.word)))
    added, rejected, seen = 0, [], set()
    for w in words:
        reason = _reject_reason(w)
        if reason is not None:
            rejected.append({"word": w, "reason": reason})
            continue
        if w in existing or w in seen:
            continue  # ponytail: silent dedupe; surfacing dup counts is YAGNI
        seen.add(w)
        db.add(WordlistEntry(id=uuid.uuid4(), word=w, length=len(w), status="active"))
        added += 1
    db.flush()
    return {"added": added, "rejected": rejected}


def stats(db: Session) -> dict:
    def _count(status: str) -> int:
        return db.scalar(
            select(func.count()).select_from(WordlistEntry).where(WordlistEntry.status == status)
        ) or 0

    rows = db.execute(
        select(WordlistEntry.length, func.count())
        .where(WordlistEntry.status == "active")
        .group_by(WordlistEntry.length)
    ).all()
    by_len = {length: count for length, count in rows}
    return {
        "active": _count("active"),
        "blocked": _count("blocked"),
        "by_length": {n: by_len.get(n, 0) for n in range(3, 14)},
    }
```

- [x] **Step 4: Run to verify pass**

Run: `uv run pytest tests/test_wordlist.py -v`
Expected: PASS — `8 passed`.

- [x] **Step 5: Commit**

```bash
git add backend/app/services/wordlist.py backend/tests/test_wordlist.py
git commit -m "feat(admin): global wordlist service (crud, bulk import, stats)"
```

---

### Task 2: Wordlist admin endpoints

**Files:**
- Modify: `backend/app/routers/admin.py`
- Test: `backend/tests/test_admin_wordlist.py`

**Interfaces:**
- Consumes: `wordlist.add_word/list_words/update_entry/bulk_import/stats` (Task 1); `get_db` (built).
- Produces:
  - `GET /api/admin/wordlist?status=&length=&search=` → `[{id, word, length, status}]`.
  - `POST /api/admin/wordlist {word}` → 201 `{id, word, length, status}`; 422 on invalid.
  - `PATCH /api/admin/wordlist/{entry_id} {word?, status?}` → `{id, word, length, status}`; 422 invalid; 404 missing.
  - `POST /api/admin/wordlist/bulk {text}` → `{added, rejected:[{word, reason}]}` (server splits `text` on whitespace).
  - `GET /api/admin/wordlist/stats` → `{active, blocked, by_length}` (JSON keys of `by_length` are strings `"3".."13"`).

> Note: declare `GET /wordlist/stats` **before** any `/wordlist/{entry_id}` GET would exist; here there is no `{entry_id}` GET, so order is not load-bearing, but keep `stats` adjacent to the other wordlist routes for readability.

- [x] **Step 1: Write the failing tests**

`backend/tests/test_admin_wordlist.py`:
```python
def test_add_then_list(client):
    resp = client.post("/api/admin/wordlist", json={"word": "თბილისი"})
    assert resp.status_code == 201
    assert resp.json()["length"] == 7

    listed = client.get("/api/admin/wordlist").json()
    assert [w["word"] for w in listed] == ["თბილისი"]


def test_add_invalid_returns_422(client):
    resp = client.post("/api/admin/wordlist", json={"word": "abc"})
    assert resp.status_code == 422


def test_block_via_patch_then_filter(client):
    wid = client.post("/api/admin/wordlist", json={"word": "ბათუმი"}).json()["id"]
    patched = client.patch(f"/api/admin/wordlist/{wid}", json={"status": "blocked"})
    assert patched.status_code == 200 and patched.json()["status"] == "blocked"
    assert client.get("/api/admin/wordlist?status=active").json() == []


def test_patch_unknown_returns_404(client):
    import uuid
    resp = client.patch(f"/api/admin/wordlist/{uuid.uuid4()}", json={"status": "blocked"})
    assert resp.status_code == 404


def test_bulk_import_reports_added_and_rejected(client):
    resp = client.post("/api/admin/wordlist/bulk", json={"text": "თბილისი ბათუმი ab"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["added"] == 2
    assert body["rejected"] == [{"word": "ab", "reason": "length<3"}]


def test_stats_endpoint_shape(client):
    client.post("/api/admin/wordlist", json={"word": "აბგ"})
    body = client.get("/api/admin/wordlist/stats").json()
    assert body["active"] == 1
    assert body["by_length"]["3"] == 1  # JSON object keys are strings
    assert body["by_length"]["4"] == 0
```

- [x] **Step 2: Run to verify failure**

Run: `uv run pytest tests/test_admin_wordlist.py -v`
Expected: FAIL — 404s / missing routes.

- [x] **Step 3: Implement the endpoints**

Append to `backend/app/routers/admin.py` (the `from fastapi import ... HTTPException`, `BaseModel`, `Session`, `get_db` imports already exist at the top of the file):
```python
from app.services.wordlist import (
    add_word,
    bulk_import,
    list_words,
    stats,
    update_entry,
)


class WordlistAddRequest(BaseModel):
    word: str


class WordlistUpdateRequest(BaseModel):
    word: str | None = None
    status: str | None = None


class WordlistBulkRequest(BaseModel):
    text: str


def _wordlist_row(r) -> dict:
    return {"id": str(r.id), "word": r.word, "length": r.length, "status": r.status}


@router.get("/wordlist")
def wordlist_list(
    status: str | None = None,
    length: int | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
):
    return [_wordlist_row(r) for r in list_words(db, status, length, search)]


@router.get("/wordlist/stats")
def wordlist_stats(db: Session = Depends(get_db)):
    return stats(db)


@router.post("/wordlist", status_code=201)
def wordlist_add(body: WordlistAddRequest, db: Session = Depends(get_db)):
    try:
        row = add_word(db, body.word)
    except ValueError as e:
        raise HTTPException(422, str(e))
    db.commit()
    return _wordlist_row(row)


@router.patch("/wordlist/{entry_id}")
def wordlist_update(entry_id: uuid.UUID, body: WordlistUpdateRequest, db: Session = Depends(get_db)):
    try:
        row = update_entry(db, entry_id, word=body.word, status=body.status)
    except ValueError as e:
        if str(e) == "not found":
            raise HTTPException(404, "wordlist entry not found")
        raise HTTPException(422, str(e))
    db.commit()
    return _wordlist_row(row)


@router.post("/wordlist/bulk")
def wordlist_bulk(body: WordlistBulkRequest, db: Session = Depends(get_db)):
    result = bulk_import(db, body.text.split())
    db.commit()
    return result
```

- [x] **Step 4: Run to verify pass**

Run: `uv run pytest tests/test_admin_wordlist.py -v`
Expected: PASS — `6 passed`.

- [x] **Step 5: Commit**

```bash
git add backend/app/routers/admin.py backend/tests/test_admin_wordlist.py
git commit -m "feat(admin): wordlist crud, bulk-import, and stats endpoints"
```

---

### Task 3: Puzzle create + get endpoints

**Files:**
- Modify: `backend/app/routers/admin.py`
- Test: `backend/tests/test_admin_puzzles.py`

**Interfaces:**
- Consumes: `Puzzle`, `Entry` (models, built); `get_db`.
- Produces:
  - `POST /api/admin/puzzles {theme, live_date}` → 201 `{id, theme, live_date, status}` — creates a `draft` with an empty `grid_template`. `live_date` is required (the model column is NOT NULL; the one-per-date unique index only applies to `scheduled|published`, so draft dates never collide).
  - `GET /api/admin/puzzles/{puzzle_id}` → `{id, theme, live_date, status, grid_template, entries:[{id, number, direction, answer, row, col, clue, clue_status, provenance}]}` or 404. **Admin-only — returns answers.**

- [x] **Step 1: Write the failing tests**

`backend/tests/test_admin_puzzles.py`:
```python
import uuid


def test_create_puzzle_returns_draft(client):
    resp = client.post("/api/admin/puzzles", json={"theme": "თბილისი", "live_date": "2026-07-10"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "draft" and body["theme"] == "თბილისი"
    assert body["live_date"] == "2026-07-10"


def test_get_puzzle_returns_structure_and_entries(client, db_session):
    import datetime as dt
    from app.models import Entry, Puzzle

    p = Puzzle(
        id=uuid.uuid4(), live_date=dt.date(2026, 7, 11), theme="თბილისი",
        grid_template={"rows": 13, "cols": 13}, status="draft", seed=1, version=1,
    )
    p.entries.append(
        Entry(id=uuid.uuid4(), number=1, direction="across", answer="თბილისი",
              row=0, col=0, clue=None, clue_status="pending", provenance="sourced")
    )
    db_session.add(p)
    db_session.flush()

    body = client.get(f"/api/admin/puzzles/{p.id}").json()
    assert body["grid_template"]["rows"] == 13
    assert len(body["entries"]) == 1
    assert body["entries"][0]["answer"] == "თბილისი"


def test_get_unknown_puzzle_404(client):
    assert client.get(f"/api/admin/puzzles/{uuid.uuid4()}").status_code == 404
```

- [x] **Step 2: Run to verify failure**

Run: `uv run pytest tests/test_admin_puzzles.py -v`
Expected: FAIL — routes missing (the create route 404s, the get route 404s for the wrong reason).

- [x] **Step 3: Implement the endpoints**

Append to `backend/app/routers/admin.py` (add `import datetime as dt` at the top with the other imports if not present; `Puzzle` is already imported, add `Entry` to that import line):
```python
class CreatePuzzleRequest(BaseModel):
    theme: str
    live_date: dt.date


@router.post("/puzzles", status_code=201)
def create_puzzle(body: CreatePuzzleRequest, db: Session = Depends(get_db)):
    puzzle = Puzzle(
        id=uuid.uuid4(), live_date=body.live_date, theme=body.theme,
        grid_template={}, status="draft", seed=None, version=1,
    )
    db.add(puzzle)
    db.commit()
    return {
        "id": str(puzzle.id), "theme": puzzle.theme,
        "live_date": puzzle.live_date.isoformat(), "status": puzzle.status,
    }


@router.get("/puzzles/{puzzle_id}")
def get_puzzle(puzzle_id: uuid.UUID, db: Session = Depends(get_db)):
    puzzle = db.get(Puzzle, puzzle_id)
    if puzzle is None:
        raise HTTPException(404, "puzzle not found")
    return {
        "id": str(puzzle.id), "theme": puzzle.theme,
        "live_date": puzzle.live_date.isoformat(), "status": puzzle.status,
        "grid_template": puzzle.grid_template,
        "entries": [
            {
                "id": str(e.id), "number": e.number, "direction": e.direction,
                "answer": e.answer, "row": e.row, "col": e.col,
                "clue": e.clue, "clue_status": e.clue_status, "provenance": e.provenance,
            }
            for e in puzzle.entries
        ],
    }
```
Update the existing import line `from app.models import Job, Puzzle` to `from app.models import Entry, Job, Puzzle` (so `Entry` is available if you later reference it; the serialization above reads entries off the relationship and does not strictly need the import, but keep models imported consistently). Confirm `import datetime as dt` is at the top of the file.

- [x] **Step 4: Run to verify pass**

Run: `uv run pytest tests/test_admin_puzzles.py -v`
Expected: PASS — `3 passed`.

- [x] **Step 5: Run the whole backend suite (excluding perf) to confirm no regressions**

Run: `uv run pytest -m "not perf" -q`
Expected: PASS (existing tests + the new ones).

- [x] **Step 6: Commit**

```bash
git add backend/app/routers/admin.py backend/tests/test_admin_puzzles.py
git commit -m "feat(admin): create-draft and get-puzzle endpoints"
```

---

### Task 4: WordlistManager screen + its API client

**Files:**
- Modify: `frontend/src/api/admin.ts`
- Create: `frontend/src/components/WordlistManager.tsx`, `frontend/src/components/__test__/WordlistManager.test.tsx`

**Interfaces:**
- Consumes: `DataTable` (built), the wordlist endpoints (Task 2).
- Produces (in `api/admin.ts`):
  - `WordlistWord { id, word, length, status }`, `WordlistStats { active, blocked, by_length }`, `ImportResult { added, rejected }`.
  - `fetchWordlist(params?: { status?: string; search?: string }) -> Promise<WordlistWord[]>`.
  - `addWord(word: string) -> Promise<WordlistWord>`.
  - `updateWord(id: string, patch: { word?: string; status?: string }) -> Promise<WordlistWord>`.
  - `bulkImport(text: string) -> Promise<ImportResult>`.
  - `fetchWordlistStats() -> Promise<WordlistStats>`.
- Produces (component): `WordlistManager()` — add box, bulk-import textarea, status filter, a `<DataTable selectable>` of words, **Block selected / Unblock selected** buttons, and a length histogram.

- [x] **Step 1: Add the API wrappers**

Append to `frontend/src/api/admin.ts` (the module already defines `const BASE = "/api/admin";`):
```ts
export interface WordlistWord {
  id: string;
  word: string;
  length: number;
  status: string;
}

export interface WordlistStats {
  active: number;
  blocked: number;
  by_length: Record<string, number>;
}

export interface ImportResult {
  added: number;
  rejected: { word: string; reason: string }[];
}

export async function fetchWordlist(params?: { status?: string; search?: string }): Promise<WordlistWord[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.search) qs.set("search", params.search);
  const suffix = qs.toString() ? `?${qs}` : "";
  const res = await fetch(`${BASE}/wordlist${suffix}`);
  if (!res.ok) throw new Error(`wordlist failed: ${res.status}`);
  return res.json();
}

export async function addWord(word: string): Promise<WordlistWord> {
  const res = await fetch(`${BASE}/wordlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ word }),
  });
  if (!res.ok) throw new Error(`addWord failed: ${res.status}`);
  return res.json();
}

export async function updateWord(
  id: string,
  patch: { word?: string; status?: string },
): Promise<WordlistWord> {
  const res = await fetch(`${BASE}/wordlist/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`updateWord failed: ${res.status}`);
  return res.json();
}

export async function bulkImport(text: string): Promise<ImportResult> {
  const res = await fetch(`${BASE}/wordlist/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`bulkImport failed: ${res.status}`);
  return res.json();
}

export async function fetchWordlistStats(): Promise<WordlistStats> {
  const res = await fetch(`${BASE}/wordlist/stats`);
  if (!res.ok) throw new Error(`stats failed: ${res.status}`);
  return res.json();
}
```

- [x] **Step 2: Write the failing component test**

`frontend/src/components/__test__/WordlistManager.test.tsx`:
```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WordlistManager } from "../WordlistManager";

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/wordlist/stats")) return json({ active: 1, blocked: 0, by_length: { "3": 1 } });
    if (u.endsWith("/wordlist/bulk")) return json({ added: 2, rejected: [] });
    if (u.includes("/wordlist") && init?.method === "POST") return json({ id: "1", word: "აბგ", length: 3, status: "active" });
    if (u.includes("/wordlist/") && init?.method === "PATCH") return json({ id: "1", word: "აბგ", length: 3, status: "blocked" });
    if (u.includes("/wordlist")) return json([{ id: "1", word: "აბგ", length: 3, status: "active" }]);
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("WordlistManager", () => {
  it("lists words and shows the length histogram on mount", async () => {
    render(<WordlistManager />);
    expect(await screen.findByText("აბგ")).toBeInTheDocument();
    expect(screen.getByText(/აქტიური: 1/)).toBeInTheDocument();
  });

  it("blocks the selected word", async () => {
    render(<WordlistManager />);
    await screen.findByText("აბგ");
    await userEvent.click(screen.getByTestId("select-1"));
    await userEvent.click(screen.getByText("დაბლოკვა"));
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(
        ([u, i]) => String(u).includes("/wordlist/1") && (i as RequestInit)?.method === "PATCH",
      );
      expect(patch).toBeTruthy();
      expect(JSON.parse((patch![1] as RequestInit).body as string)).toEqual({ status: "blocked" });
    });
  });

  it("bulk-imports pasted text", async () => {
    render(<WordlistManager />);
    await screen.findByText("აბგ");
    await userEvent.type(screen.getByLabelText("bulk import"), "თბილისი ბათუმი");
    await userEvent.click(screen.getByText("იმპორტი"));
    await waitFor(() => expect(screen.getByText(/დაემატა: 2/)).toBeInTheDocument());
  });
});
```

- [x] **Step 3: Run to verify failure**

Run (from `frontend/`): `npm test -- WordlistManager`
Expected: FAIL — `WordlistManager` module missing.

- [x] **Step 4: Implement `WordlistManager`**

`frontend/src/components/WordlistManager.tsx`:
```tsx
import { useEffect, useState } from "react";

import {
  addWord,
  bulkImport,
  fetchWordlist,
  fetchWordlistStats,
  updateWord,
  type WordlistStats,
  type WordlistWord,
} from "../api/admin";
import { DataTable } from "./DataTable";

const COLUMNS = [
  { key: "word", header: "სიტყვა" },
  { key: "length", header: "სიგრძე" },
  { key: "status", header: "სტატუსი" },
] as const;

export function WordlistManager() {
  const [words, setWords] = useState<WordlistWord[]>([]);
  const [stats, setStats] = useState<WordlistStats | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [newWord, setNewWord] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [imported, setImported] = useState<number | null>(null);

  const refresh = async () => {
    setWords(await fetchWordlist());
    setStats(await fetchWordlistStats());
    setSelected([]);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const onAdd = async () => {
    if (!newWord.trim()) return;
    await addWord(newWord.trim());
    setNewWord("");
    await refresh();
  };

  const setStatusFor = async (status: "active" | "blocked") => {
    if (selected.length === 0) return;
    await Promise.all(selected.map((id) => updateWord(id, { status })));
    await refresh();
  };

  const onImport = async () => {
    const res = await bulkImport(bulkText);
    setImported(res.added);
    setBulkText("");
    await refresh();
  };

  return (
    <div>
      <h2>ლექსიკონი</h2>
      {stats && (
        <p>
          აქტიური: {stats.active} | დაბლოკილი: {stats.blocked}
        </p>
      )}
      {stats && (
        <ul aria-label="length histogram">
          {Object.entries(stats.by_length).map(([len, count]) => (
            <li key={len}>
              {len}: {count}
            </li>
          ))}
        </ul>
      )}

      <input
        aria-label="new word"
        placeholder="სიტყვა"
        value={newWord}
        onChange={(e) => setNewWord(e.target.value)}
      />
      <button onClick={onAdd}>დამატება</button>

      <textarea
        aria-label="bulk import"
        placeholder="ჩასვი სიტყვები"
        value={bulkText}
        onChange={(e) => setBulkText(e.target.value)}
      />
      <button onClick={onImport}>იმპორტი</button>
      {imported !== null && <p>დაემატა: {imported}</p>}

      <button onClick={() => setStatusFor("blocked")}>დაბლოკვა</button>
      <button onClick={() => setStatusFor("active")}>განბლოკვა</button>
      <DataTable columns={[...COLUMNS]} rows={words} selectable onSelectionChange={setSelected} />
    </div>
  );
}
```

> ponytail: single-word in-place editing is in the PRD AC but deferred from the UI — `updateWord(id, { word })` exists on the API, and block + re-add covers fixing a bad entry. Wire an edit affordance only if editing turns out to be frequent.

- [x] **Step 5: Run to verify pass + typecheck**

Run (from `frontend/`): `npm test -- WordlistManager` then `npm run build`
Expected: tests PASS; build (tsc + vite) succeeds.

- [x] **Step 6: Commit**

```bash
git add frontend/src/api/admin.ts frontend/src/components/WordlistManager.tsx frontend/src/components/__test__/WordlistManager.test.tsx
git commit -m "feat(admin): global wordlist curation screen"
```

---

### Task 5: PuzzleBuilder screen + its API client

**Files:**
- Modify: `frontend/src/api/admin.ts`
- Create: `frontend/src/components/PuzzleBuilder.tsx`, `frontend/src/components/__test__/PuzzleBuilder.test.tsx`

**Interfaces:**
- Consumes: `DataTable` (built); the puzzle endpoints (Task 3) and the existing fill/poll endpoints (`POST /api/admin/puzzles/{id}/fill`, `GET /api/admin/jobs/{id}`).
- Produces (in `api/admin.ts`):
  - `PuzzleSummary { id, theme, live_date, status }`, `PuzzleEntry { id, number, direction, answer, row, col, clue, clue_status, provenance }`, `PuzzleDetail extends PuzzleSummary { grid_template, entries }`, `JobStatus { status, result, error }`.
  - `createPuzzle(theme: string, liveDate: string) -> Promise<PuzzleSummary>`.
  - `fetchPuzzle(id: string) -> Promise<PuzzleDetail>`.
  - `requestFill(puzzleId: string, seedValue: number, minSeeds: number) -> Promise<{ job_id: string }>`.
  - `pollJob(jobId: string) -> Promise<JobStatus>`.
- Produces (component): `PuzzleBuilder()` — theme + date → **Create**; min-seeds + seed-value → **Fill**; a **Check status** button that polls the job once; on `done` shows the filled entries via `<DataTable>`, on `failed` shows the error reason.

- [x] **Step 1: Add the API wrappers**

Append to `frontend/src/api/admin.ts`:
```ts
export interface PuzzleSummary {
  id: string;
  theme: string;
  live_date: string;
  status: string;
}

export interface PuzzleEntry {
  id: string;
  number: number;
  direction: string;
  answer: string;
  row: number;
  col: number;
  clue: string | null;
  clue_status: string;
  provenance: string;
}

export interface PuzzleDetail extends PuzzleSummary {
  grid_template: unknown;
  entries: PuzzleEntry[];
}

export interface JobStatus {
  status: string;
  result: unknown;
  error: string | null;
}

export async function createPuzzle(theme: string, liveDate: string): Promise<PuzzleSummary> {
  const res = await fetch(`${BASE}/puzzles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ theme, live_date: liveDate }),
  });
  if (!res.ok) throw new Error(`createPuzzle failed: ${res.status}`);
  return res.json();
}

export async function fetchPuzzle(id: string): Promise<PuzzleDetail> {
  const res = await fetch(`${BASE}/puzzles/${id}`);
  if (!res.ok) throw new Error(`fetchPuzzle failed: ${res.status}`);
  return res.json();
}

export async function requestFill(
  puzzleId: string,
  seedValue: number,
  minSeeds: number,
): Promise<{ job_id: string }> {
  const res = await fetch(`${BASE}/puzzles/${puzzleId}/fill`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seed_value: seedValue, min_seeds: minSeeds }),
  });
  if (!res.ok) throw new Error(`requestFill failed: ${res.status}`);
  return res.json();
}

export async function pollJob(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${BASE}/jobs/${jobId}`);
  if (!res.ok) throw new Error(`pollJob failed: ${res.status}`);
  return res.json();
}
```

- [x] **Step 2: Write the failing component test**

`frontend/src/components/__test__/PuzzleBuilder.test.tsx`:
```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PuzzleBuilder } from "../PuzzleBuilder";

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/puzzles") && init?.method === "POST")
      return json({ id: "p1", theme: "თბილისი", live_date: "2026-07-10", status: "draft" });
    if (u.endsWith("/fill")) return json({ job_id: "j1" });
    if (u.includes("/jobs/")) return json({ status: "done", result: { entries: 1 }, error: null });
    if (u.endsWith("/puzzles/p1"))
      return json({
        id: "p1", theme: "თბილისი", live_date: "2026-07-10", status: "draft", grid_template: {},
        entries: [{ id: "e1", number: 1, direction: "across", answer: "თბილისი", row: 0, col: 0, clue: null, clue_status: "pending", provenance: "sourced" }],
      });
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("PuzzleBuilder", () => {
  it("creates a draft, fills it, and shows the filled entries", async () => {
    render(<PuzzleBuilder />);

    await userEvent.type(screen.getByLabelText("theme"), "თბილისი");
    await userEvent.type(screen.getByLabelText("live date"), "2026-07-10");
    await userEvent.click(screen.getByText("შექმნა"));

    expect(await screen.findByText(/p1/)).toBeInTheDocument();

    await userEvent.click(screen.getByText("შევსება"));
    await userEvent.click(screen.getByText("სტატუსის შემოწმება"));

    expect(await screen.findByText("თბილისი")).toBeInTheDocument();
    expect(screen.getByText(/done/)).toBeInTheDocument();
  });

  it("shows the failure reason when the fill fails", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/puzzles") && init?.method === "POST")
        return json({ id: "p1", theme: "თ", live_date: "2026-07-10", status: "draft" });
      if (u.endsWith("/fill")) return json({ job_id: "j1" });
      if (u.includes("/jobs/")) return json({ status: "failed", result: null, error: "not enough seeds" });
      return json({});
    });
    render(<PuzzleBuilder />);
    await userEvent.type(screen.getByLabelText("theme"), "თ");
    await userEvent.type(screen.getByLabelText("live date"), "2026-07-10");
    await userEvent.click(screen.getByText("შექმნა"));
    await screen.findByText(/p1/);
    await userEvent.click(screen.getByText("შევსება"));
    await userEvent.click(screen.getByText("სტატუსის შემოწმება"));
    await waitFor(() => expect(screen.getByText(/not enough seeds/)).toBeInTheDocument());
  });
});
```

- [x] **Step 3: Run to verify failure**

Run (from `frontend/`): `npm test -- PuzzleBuilder`
Expected: FAIL — module missing.

- [x] **Step 4: Implement `PuzzleBuilder`**

`frontend/src/components/PuzzleBuilder.tsx`:
```tsx
import { useState } from "react";

import {
  createPuzzle,
  fetchPuzzle,
  pollJob,
  requestFill,
  type PuzzleEntry,
} from "../api/admin";
import { DataTable } from "./DataTable";

const COLUMNS = [
  { key: "number", header: "№" },
  { key: "direction", header: "მიმართ." },
  { key: "answer", header: "პასუხი" },
  { key: "provenance", header: "წყარო" },
] as const;

export function PuzzleBuilder() {
  const [theme, setTheme] = useState("");
  const [liveDate, setLiveDate] = useState("");
  const [puzzleId, setPuzzleId] = useState<string | null>(null);
  const [minSeeds, setMinSeeds] = useState(15);
  const [seedValue, setSeedValue] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<PuzzleEntry[]>([]);

  const onCreate = async () => {
    if (!theme.trim() || !liveDate) return;
    const p = await createPuzzle(theme.trim(), liveDate);
    setPuzzleId(p.id);
    setEntries([]);
    setJobStatus(null);
    setError(null);
  };

  const onFill = async () => {
    if (!puzzleId) return;
    const { job_id } = await requestFill(puzzleId, seedValue, minSeeds);
    setJobId(job_id);
    setJobStatus("pending");
    setError(null);
  };

  const onCheck = async () => {
    if (!jobId || !puzzleId) return;
    const job = await pollJob(jobId);
    setJobStatus(job.status);
    if (job.status === "failed") {
      setError(job.error);
    } else if (job.status === "done") {
      const detail = await fetchPuzzle(puzzleId);
      setEntries(detail.entries);
    }
  };

  return (
    <div>
      <h2>ფაზლის აწყობა</h2>
      <input aria-label="theme" placeholder="თემა" value={theme} onChange={(e) => setTheme(e.target.value)} />
      <input aria-label="live date" type="date" value={liveDate} onChange={(e) => setLiveDate(e.target.value)} />
      <button onClick={onCreate}>შექმნა</button>

      {puzzleId && (
        <>
          <p>ID: {puzzleId}</p>
          <label>
            seeds min
            <input
              aria-label="min seeds"
              type="number"
              value={minSeeds}
              onChange={(e) => setMinSeeds(Number(e.target.value))}
            />
          </label>
          <label>
            seed
            <input
              aria-label="seed value"
              type="number"
              value={seedValue}
              onChange={(e) => setSeedValue(Number(e.target.value))}
            />
          </label>
          <button onClick={onFill}>შევსება</button>
        </>
      )}

      {jobId && <button onClick={onCheck}>სტატუსის შემოწმება</button>}
      {jobStatus && <p>სტატუსი: {jobStatus}</p>}
      {error && <p role="alert">{error}</p>}
      {entries.length > 0 && <DataTable columns={[...COLUMNS]} rows={entries} />}
    </div>
  );
}
```

> ponytail: a manual "Check status" poll, not an auto-refresh `setInterval` — it's the lazy, deterministically testable version. Swap to polling-on-a-timer (or react-query's `refetchInterval`) only if manual checking annoys the admin.

- [x] **Step 5: Run to verify pass + typecheck**

Run (from `frontend/`): `npm test -- PuzzleBuilder` then `npm run build`
Expected: tests PASS; build succeeds.

- [x] **Step 6: Commit**

```bash
git add frontend/src/api/admin.ts frontend/src/components/PuzzleBuilder.tsx frontend/src/components/__test__/PuzzleBuilder.test.tsx
git commit -m "feat(admin): puzzle create + fill builder screen"
```

---

### Task 6: Admin shell + mount on /admin

**Files:**
- Create: `frontend/src/components/AdminApp.tsx`, `frontend/src/components/__test__/AdminApp.test.tsx`
- Modify: `frontend/src/main.tsx`

**Interfaces:**
- Consumes: `PoolReview` (built), `WordlistManager` (Task 4), `PuzzleBuilder` (Task 5).
- Produces: `AdminApp()` — three tab buttons (პული / ლექსიკონი / აწყობა) switching a `useState` tab between the three screens. `main.tsx` renders `<AdminApp/>` when `window.location.pathname` starts with `/admin`, else `<PlayView/>`.

- [x] **Step 1: Write the failing test**

`frontend/src/components/__test__/AdminApp.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminApp } from "../AdminApp";

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

beforeEach(() => {
  // The child screens fetch on mount; return empty/benign payloads.
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const u = String(url);
      if (u.endsWith("/wordlist/stats")) return json({ active: 0, blocked: 0, by_length: {} });
      if (u.includes("/wordlist")) return json([]);
      return json([]);
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("AdminApp", () => {
  it("defaults to the pool tab and switches to wordlist", async () => {
    render(<AdminApp />);
    // Pool screen renders its extract button.
    expect(screen.getByText("ამოღება")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "ლექსიკონი" }));
    expect(await screen.findByText("ლექსიკონი", { selector: "h2" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "აწყობა" }));
    expect(screen.getByText("ფაზლის აწყობა")).toBeInTheDocument();
  });
});
```

- [x] **Step 2: Run to verify failure**

Run (from `frontend/`): `npm test -- AdminApp`
Expected: FAIL — module missing.

- [x] **Step 3: Implement `AdminApp`**

`frontend/src/components/AdminApp.tsx`:
```tsx
import { useState } from "react";

import { PoolReview } from "./PoolReview";
import { PuzzleBuilder } from "./PuzzleBuilder";
import { WordlistManager } from "./WordlistManager";

type Tab = "pool" | "wordlist" | "build";

export function AdminApp() {
  const [tab, setTab] = useState<Tab>("pool");
  return (
    <div>
      <nav>
        <button onClick={() => setTab("pool")}>პული</button>
        <button onClick={() => setTab("wordlist")}>ლექსიკონი</button>
        <button onClick={() => setTab("build")}>აწყობა</button>
      </nav>
      {tab === "pool" && <PoolReview />}
      {tab === "wordlist" && <WordlistManager />}
      {tab === "build" && <PuzzleBuilder />}
    </div>
  );
}
```

> Note: both the nav button and the `WordlistManager` `<h2>` carry the text "ლექსიკონი"; the test disambiguates the heading with `{ selector: "h2" }` and the button with `getByRole("button", …)`.

- [x] **Step 4: Run to verify pass**

Run (from `frontend/`): `npm test -- AdminApp`
Expected: PASS.

- [x] **Step 5: Mount the shell in `main.tsx`**

Replace `frontend/src/main.tsx` with:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AdminApp } from "./components/AdminApp";
import { PlayView } from "./components/PlayView";

const queryClient = new QueryClient();
// ponytail: pathname switch instead of a router dependency; add react-router when routes multiply.
const isAdmin = window.location.pathname.startsWith("/admin");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {isAdmin ? <AdminApp /> : <PlayView />}
    </QueryClientProvider>
  </StrictMode>,
);
```

- [x] **Step 6: Run the full frontend suite + build**

Run (from `frontend/`): `npm test` then `npm run build`
Expected: all tests PASS; build succeeds.

- [x] **Step 7: Commit**

```bash
git add frontend/src/components/AdminApp.tsx frontend/src/components/__test__/AdminApp.test.tsx frontend/src/main.tsx
git commit -m "feat(admin): admin shell with pool/wordlist/build tabs, mounted on /admin"
```

---

## Self-Review

**Spec coverage (`docs/ADMIN_PRD.md`, `docs/ADMIN_TDD.md`):**
- Global wordlist curation — list/search/filter, add, block/unblock, bulk import, per-length histogram (PRD §2.4-A; TDD §4.1, §4.4) — Tasks 1, 2, 4. ✅
- AI/import re-validation as a trust boundary (TDD §8) — Task 1 reuses `is_georgian_word`/`valid_length`; bulk import reports rejects. ✅
- Per-puzzle themed config + create draft (PRD §2.4-B; TDD §4.4 `POST /puzzles`) — Task 3 (theme-based seeds per Q1; no `puzzle_id` introduced). ✅
- Deterministic async fill, poll, provenance, failure reason (PRD §2.4-C; TDD §4.3) — Task 5 uses the **already-built** `/fill` + `/jobs/{id}`; surfaces `provenance` and the structured `error`. ✅
- Reusable `<DataTable>` (TDD §4.7) — Tasks 4, 5 reuse it. ✅
- Admin shell hosting the screens (TDD §4.7) — Task 6. ✅
- **Out of scope, intentionally:** clue generation/review (Clues plan), scheduling/runway (Publishing plan), `require_admin` gate (Auth phase), real scrapers (ToS gate), single-word UI editing (deferred with a ponytail note). ✅

**Placeholder scan:** every code step contains complete, runnable code; no TBD/TODO/"add error handling"; all referenced symbols (`add_word`, `update_entry`, `bulk_import`, `stats`, `createPuzzle`, `fetchPuzzle`, `requestFill`, `pollJob`, `fetchWordlist`, `updateWord`, `bulkImport`, `fetchWordlistStats`) are defined in this plan or already exist in the codebase. ✅

**Type consistency:** `WordlistWord {id, word, length, status}` matches the `_wordlist_row` endpoint shape; `by_length` is `Record<string, number>` on the client to match JSON string keys (the service uses int keys, asserted in the service test, and the endpoint test checks `"3"`); `JobStatus {status, result, error}` matches the existing `/jobs/{id}` response; `requestFill` body `{seed_value, min_seeds}` matches the existing `FillRequest`. ✅

---

## Roadmap Placement

This plan is **Plan 9 — Admin Curation & Builder UI** in `docs/superpowers/plans/ROADMAP.md`. It depends on **Plan 2 (Solver)** for the fill/poll endpoints and **Plan 3 (Sourcing & Pool)** for the pool screen + `<DataTable>`. Build order: `… 3 → 9 → 4 (Clues) → 5 (Publishing) …` — the admin shell created here is where the Clues plan's `ClueReview` and the Publishing plan's `RunwayDashboard` later add tabs. The wordlist-curation half (Tasks 1–2, 4) can land immediately after Plan 3; the builder half (Tasks 3, 5) needs Plan 2.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-19-admin-curation-builder.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
