# Publishing & Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Schedule a finished puzzle to a date (one live puzzle per date), promote scheduled
puzzles to published on their live date in `Asia/Tbilisi`, and surface a **runway** dashboard
that warns when fewer than 7 future days are covered.

**Architecture:** Reuses the Walking Skeleton's `schedule_puzzle` / `promote_due_puzzles` and the
partial unique index (one `scheduled`/`published` per `live_date`), and the Clues plan's
`can_publish` gate. Adds a pure `runway_days` calculation, a schedule endpoint that surfaces the
one-per-date conflict as HTTP 409, a runway dashboard endpoint, and a **daily scheduler tick** in
the worker that promotes due puzzles once per Tbilisi day.

**Tech Stack:** Builds on Walking Skeleton (publish service, worker) + Clues (publish gate).

## Global Constraints

- **One live puzzle per `live_date`** — enforced by the DB partial unique index (Walking Skeleton);
  the API converts the `IntegrityError` into a clean 409 (DESIGN.md §4.5).
- **Publish only finished puzzles** — `schedule_puzzle` already calls `can_publish` (Clues plan).
- **Timezone `Asia/Tbilisi`** for "today" and promotion (DESIGN.md Open Q3).
- **Runway < 7 days → warning** — both a product feature and a monitored metric (DESIGN.md §10, §11).
- **Content safety net:** keep runway ≥ 7 so a rollback never yields an empty Play view (DESIGN.md §11).

## File Structure

```
backend/app/
├── services/publish.py     # +runway_days (modify)
├── routers/admin.py        # +POST /puzzles/{id}/schedule, +GET /dashboard/runway (modify)
└── worker.py               # +daily promote tick (modify)
frontend/src/components/RunwayDashboard.tsx + test
```

---

### Task 1: Runway calculation

**Files:**
- Modify: `backend/app/services/publish.py` (add `runway_days`)
- Test: `backend/tests/test_runway.py`

**Interfaces:**
- Produces: `publish.runway_days(db, today: date) -> int` — the number of **consecutive** days
  starting at `today` for which a `scheduled` or `published` puzzle exists. (Gap on any day stops
  the count.)

- [x] **Step 1: Write the failing tests**

`backend/tests/test_runway.py`:
```python
import datetime as dt
import uuid

from app.models import Puzzle
from app.services.publish import runway_days


def _live(db, day, status="scheduled"):
    db.add(Puzzle(id=uuid.uuid4(), live_date=day, theme="t", grid_template={}, status=status, seed=1, version=1))


def test_runway_counts_consecutive_days(db_session):
    base = dt.date(2026, 6, 18)
    for i in range(3):  # today, +1, +2
        _live(db_session, base + dt.timedelta(days=i))
    db_session.flush()
    assert runway_days(db_session, base) == 3


def test_runway_stops_at_gap(db_session):
    base = dt.date(2026, 6, 18)
    _live(db_session, base)
    _live(db_session, base + dt.timedelta(days=2))  # gap at +1
    db_session.flush()
    assert runway_days(db_session, base) == 1


def test_runway_zero_when_today_uncovered(db_session):
    base = dt.date(2026, 6, 18)
    _live(db_session, base + dt.timedelta(days=1))
    db_session.flush()
    assert runway_days(db_session, base) == 0
```

- [x] **Step 2: Run to verify failure → Step 3: Implement**

Append to `backend/app/services/publish.py`:
```python
import datetime as dt as _dt_unused  # noqa  (dt already imported at top of file)


def runway_days(db: Session, today: dt.date) -> int:
    covered = set(
        db.scalars(
            select(Puzzle.live_date).where(
                Puzzle.status.in_(("scheduled", "published")),
                Puzzle.live_date >= today,
            )
        )
    )
    count = 0
    day = today
    while day in covered:
        count += 1
        day += dt.timedelta(days=1)
    return count
```
(Remove the bogus `import ... as _dt_unused` line — `dt` and `select`/`Puzzle` are already
imported at the top of `publish.py`; it's shown only to flag the dependency.)

- [x] **Step 4: Run to verify pass; Step 5: Commit**

```bash
git add backend/app/services/publish.py backend/tests/test_runway.py
git commit -m "feat(publishing): consecutive-day runway calculation"
```

---

### Task 2: Schedule + runway endpoints

**Files:**
- Modify: `backend/app/routers/admin.py`
- Test: `backend/tests/test_admin_publish.py`

**Interfaces:**
- Produces:
  - `POST /api/admin/puzzles/{id}/schedule {live_date}` → 200 `{status, live_date}`; **409** if
    another puzzle already holds that date; **422** if `can_publish` fails (clues not done).
  - `GET /api/admin/dashboard/runway` → `{runway_days, warning}` (`warning = runway_days < 7`).

- [x] **Step 1: Write the failing tests**

`backend/tests/test_admin_publish.py`:
```python
import datetime as dt
import uuid

from app.models import Entry, Puzzle


def _ready_puzzle(db, day):  # a puzzle whose clues are all accepted
    p = Puzzle(id=uuid.uuid4(), live_date=day, theme="t", grid_template={}, status="draft", seed=1, version=1)
    p.entries.append(Entry(id=uuid.uuid4(), number=1, direction="across", answer="თბილისი", row=0, col=0, clue="c", clue_status="accepted", provenance="sourced"))
    db.add(p)
    db.flush()
    return p


def test_schedule_succeeds(client, db_session):
    p = _ready_puzzle(db_session, dt.date(2026, 9, 1))
    db_session.flush()
    resp = client.post(f"/api/admin/puzzles/{p.id}/schedule", json={"live_date": "2026-09-10"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "scheduled"


def test_schedule_conflict_returns_409(client, db_session):
    a = _ready_puzzle(db_session, dt.date(2026, 9, 2))
    b = _ready_puzzle(db_session, dt.date(2026, 9, 3))
    db_session.flush()
    client.post(f"/api/admin/puzzles/{a.id}/schedule", json={"live_date": "2026-09-20"})
    resp = client.post(f"/api/admin/puzzles/{b.id}/schedule", json={"live_date": "2026-09-20"})
    assert resp.status_code == 409


def test_schedule_blocked_when_clues_unfinished(client, db_session):
    p = Puzzle(id=uuid.uuid4(), live_date=dt.date(2026, 9, 4), theme="t", grid_template={}, status="draft", seed=1, version=1)
    p.entries.append(Entry(id=uuid.uuid4(), number=1, direction="across", answer="თბილისი", row=0, col=0, clue="c", clue_status="generated", provenance="sourced"))
    db_session.add(p)
    db_session.flush()
    resp = client.post(f"/api/admin/puzzles/{p.id}/schedule", json={"live_date": "2026-09-25"})
    assert resp.status_code == 422


def test_runway_endpoint(client, db_session):
    resp = client.get("/api/admin/dashboard/runway")
    assert resp.status_code == 200
    body = resp.json()
    assert "runway_days" in body and "warning" in body
```

- [x] **Step 2: Run to verify failure → Step 3: Implement**

Append to `backend/app/routers/admin.py`:
```python
import datetime as dt

from sqlalchemy.exc import IntegrityError

from app.services.publish import runway_days, schedule_puzzle
from app.services.puzzles import today_tbilisi


class ScheduleRequest(BaseModel):
    live_date: dt.date


@router.post("/puzzles/{puzzle_id}/schedule")
def schedule(puzzle_id: uuid.UUID, body: ScheduleRequest, db: Session = Depends(get_db)):
    if db.get(Puzzle, puzzle_id) is None:
        raise HTTPException(404, "puzzle not found")
    try:
        puzzle = schedule_puzzle(db, puzzle_id, body.live_date)  # raises ValueError if not publishable
        db.commit()
    except ValueError as e:
        db.rollback()
        raise HTTPException(422, str(e))
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "another puzzle is already scheduled for that date")
    return {"status": puzzle.status, "live_date": puzzle.live_date.isoformat()}


@router.get("/dashboard/runway")
def runway(db: Session = Depends(get_db)):
    days = runway_days(db, today_tbilisi())
    return {"runway_days": days, "warning": days < 7}
```

- [x] **Step 4: Run to verify pass; Step 5: Commit**

```bash
git add backend/app/routers/admin.py backend/tests/test_admin_publish.py
git commit -m "feat(publishing): schedule (409 on conflict) and runway dashboard endpoints"
```

---

### Task 3: Daily promote tick in the worker

**Files:**
- Modify: `backend/app/worker.py`
- Test: `backend/tests/test_worker_promote.py`

**Interfaces:**
- Produces:
  - `worker.promote_tick(db, today) -> int` — calls `promote_due_puzzles` and returns the count;
    safe to call repeatedly (idempotent — already-published puzzles are untouched).
  - `worker.run_forever` also fires `promote_tick` once per Tbilisi day (track last-run date).

- [x] **Step 1: Write the failing test**

`backend/tests/test_worker_promote.py`:
```python
import datetime as dt
import uuid

from app.models import Puzzle
from app.worker import promote_tick


def test_promote_tick_publishes_due(db_session):
    today = dt.date(2026, 6, 18)
    db_session.add(Puzzle(id=uuid.uuid4(), live_date=today, theme="t", grid_template={}, status="scheduled", seed=1, version=1))
    db_session.add(Puzzle(id=uuid.uuid4(), live_date=today + dt.timedelta(days=5), theme="t", grid_template={}, status="scheduled", seed=1, version=1))
    db_session.flush()
    assert promote_tick(db_session, today) == 1
    # Idempotent: second call promotes nothing new.
    assert promote_tick(db_session, today) == 0
```

- [x] **Step 2: Run to verify failure → Step 3: Implement**

Append to `backend/app/worker.py`:
```python
import datetime as dt

from app.services.publish import promote_due_puzzles
from app.services.puzzles import today_tbilisi


def promote_tick(db: Session, today: dt.date) -> int:
    n = promote_due_puzzles(db, today)
    db.commit()
    return n
```
In `run_forever`, keep a `last_promote_date` and call `promote_tick(db, today_tbilisi())` once
when the Tbilisi date rolls over:
```python
    last_promote = None
    while True:
        today = today_tbilisi()
        with SessionLocal() as db:
            if today != last_promote:
                promote_tick(db, today)
                last_promote = today
            did = tick(db, library, seeds_provider=...)
        if not did:
            time.sleep(poll_s)
```

- [x] **Step 4: Run to verify pass; Step 5: Commit**

```bash
git add backend/app/worker.py backend/tests/test_worker_promote.py
git commit -m "feat(publishing): daily promote tick in the worker"
```

---

### Task 4: Runway dashboard UI

**Files:**
- Create: `frontend/src/components/RunwayDashboard.tsx`, `RunwayDashboard.test.tsx`
- Modify: `frontend/src/api/admin.ts` (add `fetchRunway`)

**Interfaces:**
- Produces: `RunwayDashboard()` — fetches `/api/admin/dashboard/runway` on mount; shows
  `{runway_days} days` and a visible warning banner when `warning` is true.

- [x] **Step 1: Write the failing test** (api mocked): with `fetchRunway` returning
`{runway_days: 3, warning: true}`, render shows "3" and a `role="alert"` banner; with
`{runway_days: 10, warning: false}`, no alert.

- [x] **Step 2: Run to verify failure → Step 3: Implement** `RunwayDashboard` + `fetchRunway`
(GET wrapper, same pattern as `api/play.ts`).

- [x] **Step 4: Run the frontend suite + typecheck; Step 5: Commit**

```bash
git add frontend/src/components/RunwayDashboard.tsx frontend/src/components/RunwayDashboard.test.tsx frontend/src/api/admin.ts
git commit -m "feat(publishing): runway dashboard UI with warning banner"
```

---

## Self-Review

**Spec coverage (DESIGN.md §4.2.8, §10, §11):**
- Schedule to a date, single-live-per-date invariant surfaced as 409 (§4.5) — Tasks 1–2. ✅
- Publish gate enforced at schedule time (§4.2.7, via Clues plan) — Task 2 (422 path). ✅
- Runway calc + `< 7 days` warning (§10, §11) — Tasks 1, 2, 4. ✅
- Daily promotion in `Asia/Tbilisi` (§4.2.8, Q3) — Task 3. ✅
- Content safety net (runway ≥ 7) — surfaced by the dashboard warning. ✅

**Type consistency:** `runway_days(db, today)`, `schedule_puzzle` (reused), `promote_due_puzzles`
(reused), `promote_tick`, endpoint shapes, `fetchRunway` — consistent across tasks and tests. ✅

**Cross-plan note:** Task 2's 422 path depends on the Clues plan's `can_publish` guard inside
`schedule_puzzle`; if Publishing is built before Clues, temporarily relax that guard and the 422
test until Clues lands.
