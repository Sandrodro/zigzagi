# Zigzagi Build Roadmap — Plan Execution Order

The authoritative sequence for executing the implementation plans in this folder. Each plan
produces working, testable software on its own; this doc says **what order to build them in,
what runs in parallel, what must start before the code, and the cross-plan touch-ups to expect.**

For one-line summaries see [`README.md`](README.md); for the product/architecture rationale see
`../../DESIGN.md` (§7 Implementation Plan, §15 Open Questions).

---

## TL;DR order

```
START NOW (not code):  ▣ Wordlist acquisition (Q1)     ▣ RFE/RL ToS review (Q4)
                          │                                │
Phase A ─ 1. Walking Skeleton  ──────────────────────────┐│
                          │                               ││
Phase B ─ 2. Solver ──────┤  (needs wordlist by Task 7)   ││
                          │                               ││
Phase C ─ 3. Sourcing & Pool ───┐  (paste path now;       ││
                          │      └─ scrapers gated on Q4 ──┘│
                          │                                 │
Phase C ─ 9. Admin Curation & Builder UI ─┐ (after 3; needs 2)
                          │                │                │
Phase C ─ 4. Clues ───────┤  (parallel with Sourcing)      │
                          │                                 │
Phase D ─ 5. Publishing ──┘                                │
                          │                                 │
Phase E ─ 6. Play View (full) ─────────────────────────────┘ (can start right after #1)
                          │
Phase F ─ 7. Auth + Progress Merge + Streak
                          │
Phase G ─ 8. Hardening (last)
```

**Strict linear order if you build one at a time:** 1 → 2 → 3 → 9 → 4 → 5 → 6 → 7 → 8.

**Critical path (DESIGN.md §7):** 1 → 2 → 6 (skeleton → solver → play). Sourcing (3) and Clues
(4) overlap the critical path; Publishing (5) is small.

---

## Start before any code: the two external blockers

These are **not coding tasks** and gate later plans. Kick them off in parallel with Phase A.

| Blocker | DESIGN ref | Gates | Why it can't wait |
| --- | --- | --- | --- |
| **General Georgian fill wordlist** (source + license) | §6.8, §15 Q1 | Solver **Task 7** (perf gate) and all real fills | Without it the solver fills nothing; the perf gate runs on a synthetic list until it arrives, but you cannot ship real puzzles without it. |
| **RFE/RL (radiotavisupleba) ToS sign-off** | §8, §15 Q4 | Sourcing **Task 8** (scrapers only) | Paste ingestion has no legal dependency and ships first; the scraper adapters stay `enabled=False` until this clears. |

---

## Phase-by-phase

### Phase A — Walking Skeleton (Plan 1) — *do this first, always*
The end-to-end thin slice (hand-authored puzzle → published by date → Play renders →
server-side check/reveal). Everything else appends to its models, contracts, and components.
**Exit milestone:** you can open the app and solve a seeded 5×5 with working check/reveal.

### Phase B — Solver (Plan 2) — *critical path*
Pure-Python auto-filler (modeled on `paulgb/crossword-composer`), async worker job, admin
fill/poll endpoints. **Creates `app/routers/admin.py` and the worker process** that every later
admin/worker feature reuses.
- **Depends on:** Plan 1 (Puzzle/Entry models).
- **Wordlist:** Task 7's perf gate runs on a synthetic representative list if Q1 hasn't landed;
  swap in the licensed list when it arrives. If the gate fails on the *real* list, stop and raise
  the Rust/PyO3 escalation (DESIGN.md §6.4) — a separate plan, not in scope.
- **Leaves a stub:** the worker's `seeds_provider` is injected/stubbed here; Plan 3 makes it real.
- **Exit milestone:** an enqueued fill job produces a filled 13×13 `Puzzle` + `Entry` rows.

### Phase C — Sourcing & Pool (Plan 3) + Clues (Plan 4) — *can overlap each other*
- **Sourcing (3)** depends on Plan 1, and its **endpoint task (Task 5) depends on Plan 2 having
  created `app/routers/admin.py`** — so build Solver before Sourcing's endpoints. Sourcing Task 6
  **replaces the solver's `seeds_provider` stub** with the real theme→accepted-surfaces lookup.
  Scrapers (Task 8) stay disabled until Q4.
- **Clues (4)** depends on Plan 1 and on entries existing (Plan 2). It **adds a `can_publish`
  guard inside `schedule_puzzle`** — see the touch-up table below.
- These two share only the AI client (`app/ai/`), which Sourcing creates and Clues extends, so if
  you parallelize, build Sourcing Tasks 1–3 (the client) before Clues Task 1.
- **Exit milestone:** paste text → reviewed pool → seeds feed the solver; a filled puzzle gets
  Gemini clues you can accept/edit/reject.

### Phase C — Admin Curation & Builder UI (Plan 9) — *after Sourcing; needs Solver*
The admin-facing consolidation from `../../ADMIN_PRD.md` / `../../ADMIN_TDD.md`: a **global
fill-wordlist curation** screen (add / block / bulk-import `WordlistEntry` + a length histogram),
a **puzzle builder** screen (create draft → configure theme/seeds → run fill → poll → see the
filled grid + provenance), and a **tab shell** mounted on `/admin` that also hosts the existing
pool-review screen. Pure additive work on built pieces — thin `wordlist` service + CRUD/stats
endpoints, two `/puzzles` endpoints, three React screens; **no new dependency, no auth** (the
Auth phase gates it later).
- **Depends on:** Plan 3 (pool screen + `<DataTable>`) and Plan 2 (fill/poll endpoints). The
  wordlist-curation half can land right after Plan 3; the builder half needs Plan 2.
- **Leaves a shell for later plans:** Clues' `ClueReview` and Publishing's `RunwayDashboard` add
  tabs to this `AdminApp`.
- **Defers (by design):** single-word UI editing, clue/schedule UI (their own plans), and the
  `require_admin` gate (Auth phase).
- **Exit milestone:** at `/admin` you can curate the fill wordlist and create+fill a draft puzzle
  end-to-end, seeing provenance and any structured fill-failure reason.

### Phase D — Publishing & Scheduling (Plan 5)
Schedule-to-date (409 on conflict), runway dashboard, daily Tbilisi promote tick.
- **Depends on:** Plan 1 (publish service, partial index) and Plan 4 (the `can_publish` guard its
  422 path relies on). If you build Publishing before Clues, temporarily relax that guard and the
  422 test until Clues lands.
- **Exit milestone:** the full admin pipeline — extract → fill → clue → schedule → auto-publish —
  works, with a runway warning.

### Phase E — Play View, full (Plan 6) — *parallelizable from Phase A*
Native keyboard input, clue bar/list, timer, scoped check/reveal, congrats, localStorage, WebGL
background. **Only depends on Plan 1** (Grid/engine/PlayView + check/reveal endpoints), so a
front-end-focused builder can run this alongside Phases B–D.
- **Contract to honor:** its local-persistence shape (Task 5) **must equal** the Auth plan's
  `Progress.fills` shape. Lock it here.
- **Exit milestone:** a player can solve today's puzzle on mobile, fully, anonymously.

### Phase F — Auth + Progress Merge + Streak (Plan 7)
Google OAuth, signed-in progress, anon→user merge, streak; **adds `require_admin` to every admin
router** built in Plans 2–5 in one sweep.
- **Depends on:** Plan 1 and Plan 6 (local progress shape to merge).
- **Highest-risk task:** the merge (Task 5) — build and test its three branches + idempotency.
- **Exit milestone:** sign-in merges local progress and shows a streak; admin routes are gated.

### Phase G — Hardening (Plan 8) — *last*
Eval-harness KPI gates (extraction P@all ≥ 0.70 / filter 100%; clue accept ≥ 80%), structured
metrics, rate-limiting + audit log, perf budgets, mobile E2E, deploy + rollback.
- **Depends on:** everything.
- **Exit milestone:** KPI gates pass (or block the build), and a rehearsed rollback exists.

---

## Cross-plan touch-ups (expected, by design)

These are intentional small edits a later plan makes to an earlier plan's code. None are bugs;
they're called out so they don't surprise you.

| When you build… | It modifies… | What changes | Action |
| --- | --- | --- | --- |
| Clues (4) | Skeleton (1) `schedule_puzzle` + its test | Inserts a `can_publish` guard | Update `test_schedule_sets_status_and_date` to give the puzzle accepted-clue entries (Clues Task 3). |
| Sourcing (3) | Solver (2) `worker.py` | Real `seeds_provider` replaces the stub | Wire `seeds_for_puzzle` (Sourcing Task 6). |
| Publishing (5) | depends on Clues (4) `can_publish` | 422 "clues unfinished" path | Build Clues first, or relax the guard + 422 test temporarily. |
| Auth (7) | admin routers in Plans 2–5 | Adds `require_admin` everywhere | One sweep; re-run those plans' endpoint tests with an admin session fixture (Auth Task 3). |
| Sourcing (3) endpoints | Solver (2) `app/routers/admin.py` | Appends extract/pool/suggest | Build Solver before Sourcing's Task 5 (the router must exist). |

---

## Definition-of-done per milestone (what works after each phase)

- **After A:** solve a seeded fixture puzzle end-to-end (render + server check/reveal).
- **After B:** generate a real filled 13×13 grid via an async job.
- **After C:** feed real sourced seeds into fills and attach accepted AI clues.
- **After 9:** at `/admin`, curate the global fill wordlist and create+fill a draft puzzle end-to-end.
- **After D:** schedule + auto-publish a daily puzzle with runway tracking.
- **After E:** a player solves today's puzzle on mobile, anonymously, with the full UI.
- **After F:** signed-in players keep cross-device progress + streaks; admin is gated.
- **After G:** KPI gates enforced, observable, deployable with a tested rollback.

---

## If you have two builders

Split along the critical path's natural seam:

- **Builder 1 (backend/pipeline):** A → B → C(3,4) → D.
- **Builder 2 (frontend/player):** A → E, then F after E.
- Converge before G. Builder 2 only needs Plan 1's contracts, so they unblock immediately after
  Phase A.
