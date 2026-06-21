# PRD — Zigzagi Admin Studio: Crossword Construction & Word Pool

**Status:** Draft v0.1
**Date:** 2026-06-19
**Owner:** sandrogach@gmail.com
**Scope:** The Admin surface only — creating/publishing crosswords and curating words. Derived from and consistent with `PRD.md` and `DESIGN.md`; this document consolidates the admin-relevant scope into one spec. Play view is out of scope here (see `PRD.md §2.3 PLAYER`).

---

## 1. Executive Summary

**Problem Statement**
Building Georgian crosswords by hand is too slow to sustain a *daily* puzzle, and there is no single place where a constructor can turn fresh Georgian text into a vetted word pool, fill a grid, clue it, and publish — on a schedule that never runs dry.

**Proposed Solution**
A single-admin Studio with two cooperating word stores and a linear construction pipeline:
- a **global general-fill wordlist** (curated once, reused by every puzzle), and
- **per-puzzle themed candidates** (sourced/extracted per puzzle, used as required solver seeds),
feeding **theme → seeds → deterministic fill → AI clues → schedule/publish**, with a runway warning so the Play view always has a puzzle.

**Success Criteria (MVP)**
1. From "theme + reviewed pool" to a published, solvable ~13×13 / 40–50-word puzzle in **≤ 15 min human time**.
2. Deterministic solver fills a valid symmetric grid in **≥ 90% of attempts** within **≤ 10 s**, placing **all configured seed words**.
3. **≥ 80%** of AI clues accepted with no edit or minor edit only (tracked via accept/edit/reject).
4. Admin can curate the global fill wordlist (add / edit / block / bulk-import) and see counts of active vs. blocked entries.
5. Runway dashboard warns when **< 7 days** of puzzles are queued; one and only one puzzle is live per date.

---

## 2. User Experience & Functionality

### 2.1 Personas

- **Constructor/Admin (primary, single user):** Georgian-literate editor. Wants editorial speed and final control over every word and clue. Authenticated via a Google-restricted allowlisted email (`DESIGN.md §1`, §8).

### 2.2 Two word stores (the model, kept as-is)

| Store | Scope | Role | Lifecycle |
|---|---|---|---|
| **General fill wordlist** (`WordlistEntry`) | **Global**, shared across all puzzles | Fills non-seed slots so any grid completes | Curated once and over time; `status ∈ active \| blocked` |
| **Themed candidates** (`WordCandidate`) | **Per puzzle** (configured against that puzzle's theme) | The required **seed words** the solver must place | Offered → accepted/edited/rejected per puzzle |

This PRD adds two things to the existing design without changing the model:
- a **global wordlist curation surface** (the "global component"), and
- **per-puzzle configuration** of which themed candidates seed *this* puzzle.

### 2.3 Admin flow

```
                ┌──────────────────────────────────────────────┐
Global:         │  General Fill Wordlist  (add/edit/block/import)│  ← curated independently
                └───────────────────────┬──────────────────────┘
                                         │ reused by every fill
Per puzzle:  Create puzzle (theme) ─► Configure themed candidates ─► Fill (deterministic)
                  │  paste text ─► AI extract ─┐        (seeds)            │
                  │  AI suggest  ─────────────►┤  review/accept/edit       ▼
                  │  (scrape, gated)          ─┘                     Filled symmetric grid
                                                                          │
                                                              Gemini Pro clue generation
                                                                          │
                                                            Admin accept / edit / reject
                                                                          │
                                                            Schedule to date ─► Publish
```

### 2.4 User Stories & Acceptance Criteria

**A. Global fill-wordlist curation** *(new surface; consolidates `DESIGN.md §4.5` `WordlistEntry`)*

- **Story:** As an admin, I want to curate one global Georgian fill wordlist, so every puzzle has clean material to complete its grid.
  - **AC:** A dedicated screen lists `WordlistEntry` rows with word, length, status; filterable by status and length; searchable by substring.
  - **AC:** Admin can **add** a single word, **edit** it, and toggle **block/unblock** (`active`↔`blocked`); blocked words are never used by the solver.
  - **AC:** **Bulk import** accepts a newline-delimited paste/upload; backend re-validates each entry (Georgian Mkhedruli U+10D0–U+10FF only, length 3–13) and reports a count of accepted vs. rejected with reasons.
  - **AC:** Duplicate words are de-duplicated on import (idempotent — re-importing the same list adds nothing).
  - **AC:** The screen shows totals: active count, blocked count, and a per-length histogram (length 3–13) so the admin can spot gaps that would starve the solver.

**B. Create a puzzle & configure themed candidates** *(consolidates `PRD.md §2.3 ADMIN — Word sourcing` + per-puzzle config)*

- **Story:** As an admin, I want to create a draft puzzle with a theme and assemble its themed candidate pool, so the solver has required seeds.
  - **AC:** "New puzzle" creates a `draft` `Puzzle` with a theme; the puzzle owns its own candidate configuration.
  - **AC:** **Paste ingestion:** paste box accepts ≥ 20k chars; AI extraction (Gemini Flash) returns candidates `{surface, lemma, length, snippet, theme_relevance}`, conditioned on this puzzle's theme and its already-accepted candidates.
  - **AC:** Backend re-validates alphabet + length **3–13** before anything enters the pool; invalid words are dropped with a visible dropped-count.
  - **AC:** **AI suggestions** (Gemini Flash): "Suggest words" returns N candidates relevant to theme + current pool, each flagged `in_corpus: bool`; suggestions never auto-add — admin confirms.
  - **AC:** **Scraping** (radiotavisupleba.ge, arilimag.ge, last 31 days) is available on demand and on a daily schedule; adapters stay **disabled until RFE/RL ToS sign-off** (`DESIGN.md §15 Q4`); one source failing does not block the other.
  - **AC:** Admin can **bulk accept/reject** and edit candidates; accepted candidates become this puzzle's seed set.
  - **AC:** Admin can configure the **minimum seed count** for this puzzle (default ~15–20) and **lock** specific words to force inclusion.

**C. Deterministic grid fill** *(consolidates `PRD.md §4.3`, `DESIGN.md §4.6`)*

- **Story:** As an admin, I want to fill a symmetric grid that prominently features my seeds, drawing the rest from the global wordlist.
  - **AC:** **Fill** enqueues an async solver `Job`; the admin polls status (no synchronous 10 s HTTP — `DESIGN.md §6.2`). UI shows queued/running/succeeded/failed.
  - **AC:** Solver targets 13×13, 40–50 entries, 180° rotational symmetry, min length 3; seeds placed first, remaining slots filled from **active** global `WordlistEntry`s (blocked excluded).
  - **AC:** Result tags each `Entry` `provenance ∈ sourced \| general-fill`; the admin can see which are off-corpus general fill.
  - **AC:** Fill is **fully deterministic** given `(template_id, seeds, wordlist, seed_value)` — identical inputs → byte-identical grid.
  - **AC:** On failure the admin sees a structured reason (e.g. "not enough seed words of length 3–5") and can adjust seeds, edit black squares, or **regenerate with a new seed**.

**D. AI clue generation** *(consolidates `PRD.md §2.3 ADMIN — Clue generation`)*

- **Story:** As an admin, I want NYT-Monday-register Georgian clues generated for the filled grid, so I don't write ~45 by hand.
  - **AC:** Batch clue generation (Gemini Pro) per entry includes `{answer, direction, number, theme, source_snippet?}`; output is schema-validated JSON.
  - **AC:** Admin can **accept / edit / reject+regenerate** each clue; every choice is logged for KPI #3.
  - **AC:** **Publishing is blocked until every entry has an accepted clue** (`can_publish` guard).

**E. Schedule & publish** *(consolidates `PRD.md §2.3 ADMIN — Publishing`)*

- **Story:** As an admin, I want to schedule a puzzle to a date and keep the Play view supplied.
  - **AC:** Exactly **one** scheduled/published puzzle per calendar date (partial unique index; **409** on conflict). Admin can schedule future dates and edit/unpublish before the live date.
  - **AC:** A **runway dashboard** shows "days of runway remaining" and **warns when < 7 days** are queued.
  - **AC:** The worker promotes `scheduled → published` on the live date (**Asia/Tbilisi**, `DESIGN.md §15 Q3`).
  - **AC:** After a puzzle's live date passes, structure is immutable; clue typo fixes allowed, structural edits create a new `version`.

### 2.5 Non-Goals (admin MVP)

- No AI anywhere in grid construction — fill is deterministic code only.
- No full NYT construction ruleset (full interlock, themed long entries, rebus, circles); symmetry + min-3 only.
- No multi-admin / roles / per-editor audit separation — single admin.
- No Georgian lemmatizer (admin reviews inflected forms manually; v1.1).
- No clue-quality analytics dashboard (v1.1) beyond the raw accept/edit/reject log.
- No republishing of full source article bodies.

---

## 3. AI System Requirements

### 3.1 Tasks, models, contracts *(per `PRD.md §3`, `DESIGN.md §4.7`)*

| Task | Model | Input | Output (JSON-schema enforced) |
|---|---|---|---|
| Extraction | Gemini 2.5 Flash | raw text + theme + this puzzle's pool | `[{surface, lemma, length, snippet, theme_relevance: 0–1}]` |
| Suggestion | Gemini 2.5 Flash | theme + pool | `[{word, reason, in_corpus}]` |
| Clue gen | Gemini 2.5 Pro | batched `[{entry_id, answer, direction, number, theme, source_snippet?}]` | `[{entry_id, clue}]` (Georgian, Monday register) |

- Model per task is **config-driven** (env), re-pointable without code changes.
- All calls use **structured-output mode**; malformed → **one bounded retry** → surface error to admin. **Never auto-publish on AI failure.**
- AI output is **never trusted into the grid**: backend re-validates alphabet + length on extraction/suggestion before anything enters the pool or the global wordlist.

### 3.2 Evaluation Strategy

- **Extraction:** 10-article Georgian gold set — **Precision@all ≥ 0.70** (offered words are valid/usable) and **alphabet/length filter accuracy = 100%** (no invalid char ever reaches a pool or the wordlist).
- **Clue (human-in-the-loop):** track production accept/edit/reject; target **≥ 80% accept-or-minor-edit** (KPI #3); 50-pair benchmark regression-checked on prompt changes.
- **Solver is not AI** — validated by deterministic unit tests (symmetry, min-length, crossing consistency, seed-inclusion, reproducibility), not model evals.

---

## 4. Technical Specifications

### 4.1 Architecture *(per `DESIGN.md §4.1`)*

Modular monolith: one FastAPI app (Admin API gated, Play API public) + service layer + a **separate worker process** for the daily scrape, daily publish promote, and **solver fill jobs** (async; HTTP only enqueues and polls).

```
React Admin SPA ─► /api/admin/* (gated) ─► Services ─┬─ Gemini Flash (extract/suggest)
                          │                          ├─ Gemini Pro (clues)
                          │                          ├─ Solver (pure Python, deterministic)
                          │                          └─ Scrapers (gated on ToS)
                          ▼ enqueue fill/scrape
                       Worker ─► Postgres
```

- `app/solver/` is **pure** — zero FastAPI/SQLAlchemy imports; `app/services/solver_jobs.py` is the only place solver results meet the DB (`CLAUDE.md` invariants).
- Reusable frontend components: admin `<DataTable>` (already built) backs both the candidate review screen and the new global-wordlist screen.

### 4.2 Data Model (relevant subset, unchanged) *(per `DESIGN.md §4.5`)*

- `WordlistEntry { id, word, length, status[active|blocked] }` — **global** fill list.
- `WordCandidate { id, surface, lemma, length, source_url, snippet, theme_tags, status }` — **per-puzzle** seeds. *(Per-puzzle configuration associates accepted candidates with the puzzle being built; see Open Question #1 on whether this is by `theme_tags` lookup or an explicit puzzle FK.)*
- `Puzzle { id, live_date, theme, grid_template, status[draft|scheduled|published], seed, version }` — partial unique index enforces one scheduled/published per `live_date`.
- `Entry { id, puzzle_id, number, direction, answer, row, col, clue, clue_status, provenance[sourced|general-fill] }`.
- `Job` — DB-backed fill/scrape queue claimed by the worker.

### 4.3 API Contracts *(admin subset; per `DESIGN.md §4.4`, all `/api/admin/*` gated)*

| Endpoint | Method | Purpose | Status |
|---|---|---|---|
| `/api/admin/wordlist` | GET | List global fill entries (filter status/length, search) | **New** |
| `/api/admin/wordlist` | POST | Add a single entry (re-validated) | **New** |
| `/api/admin/wordlist/{id}` | PATCH | Edit / block / unblock | **New** |
| `/api/admin/wordlist/bulk` | POST | Bulk import (validate, dedupe, report) | **New** |
| `/api/admin/sources/refresh` | POST | Enqueue scrape (gated on ToS) | Planned |
| `/api/admin/extract` | POST | Extract candidates from pasted text | Built |
| `/api/admin/pool` | GET | List candidates (filter status/theme) | Built |
| `/api/admin/pool/bulk` | PATCH | Bulk accept/reject/edit | Built |
| `/api/admin/suggest` | POST | Theme+pool suggestions | Built |
| `/api/admin/puzzles` | POST | Create draft puzzle (theme, seed/min-seed config) | Planned |
| `/api/admin/puzzles/{id}/fill` | POST | Enqueue solver fill job | Planned |
| `/api/admin/jobs/{id}` | GET | Poll fill/scrape job | Planned |
| `/api/admin/puzzles/{id}/clues` | POST | Batch-generate clues | Planned |
| `/api/admin/puzzles/{id}/clues/{eid}` | PATCH | accept / edit / reject+regenerate | Planned |
| `/api/admin/puzzles/{id}/schedule` | POST | Schedule to date (409 on conflict) | Planned |
| `/api/admin/dashboard/runway` | GET | Days-of-runway remaining | Planned |

### 4.4 Security & Privacy *(per `DESIGN.md §8`)*

- All `/api/admin/*` routes require the single-admin Google allowlist gate.
- Secrets (Gemini key, DB creds, OAuth) server-side only; AI calls proxied by backend.
- Scraping restricted to two whitelisted domains; robots.txt honored, rate-limited; store only words + short attributed snippets + source URL, never full bodies; per-source kill switch.
- Input validation on every endpoint (alphabet/length re-validation is a trust boundary — never skipped, including on bulk import); parameterized queries; audit log of publish/unpublish.

---

## 5. Risks & Roadmap

### 5.1 Risks *(admin-relevant subset of `DESIGN.md §5`)*

| Risk | Impact | Mitigation |
|---|---|---|
| **Global wordlist not sourced / thin at some lengths** | Solver can't fill → no puzzle | Phase-0 blocker (`DESIGN.md §6.8`); per-length histogram on the curation screen surfaces gaps; bulk import; block bad entries. |
| Pure-Python solver misses ≤10 s / 90% | Admin blocked | Async worker job, pattern-indexed CSP, curated templates, relaxed (unchecked) MVP grids; retry new seed/template; perf gate proven early. |
| Wordlist quality (obscure/inflected/offensive) | Bad fill answers | Offline vetting, blocklist via the curation screen, admin reviews general-fill entries pre-publish. |
| Georgian morphology (surface vs lemma) | Pool quality | AI returns lemma+surface; admin reviews; lemmatizer in v1.1. |
| Scraping ToS (RFE/RL) | Legal | Words-only + attribution, robots/rate-limit, **pre-launch ToS sign-off**, per-source kill switch; adapters disabled until then. |
| Daily treadmill (empty Play view) | Churn | Runway warning < 7 days; batch-build; immutable backlog. |
| Clue accept < 80% | Admin time | Pro model + Monday-register prompt + Georgian few-shot; track metric; iterate. |

### 5.2 Phased Rollout

- **v1.0 (MVP):** global wordlist curation surface; per-puzzle themed candidate config (paste + extract + suggest; scrapers behind ToS gate); deterministic async fill with provenance; Pro clue gen with accept/edit/reject + publish gate; schedule + one-per-date + runway dashboard + Tbilisi auto-publish.
- **v1.1:** Georgian lemmatizer; clue-quality dashboard; admin analytics on AI accept rates; wordlist scoring/tags beyond active/blocked.
- **v2.0:** full interlock construction; true 15×15 Monday grids; more sources; difficulty tiers.

---

## 6. Open Questions

| # | Question | Why it matters | Status |
|---|---|---|---|
| 1 | Per-puzzle candidate association: lookup by `theme_tags` (current `seeds_provider`) or an explicit `WordCandidate.puzzle_id`? | Determines whether candidates are reusable across puzzles or owned by one; affects the model and the "configure per puzzle" UI. | 🔴 Open — decide before building puzzle-create |
| 2 | Final minimum seed-word count default (~15–20)? | Solver feasibility per puzzle. | 🟡 Tune after first fills |
| 3 | Does the global wordlist screen need length-gap *targets* (e.g. min N words per length) or just a histogram? | Decides whether the screen merely displays or also gates/warns. | 🟡 Histogram only for MVP unless told otherwise |
| 4 | RFE/RL ToS sign-off before enabling scrapers. | Gates the scrape path. | 🔴 Open (`DESIGN.md §15 Q4`) |
| 5 | Wordlist source + license. | Gates real fills. | 🔴 Open (`DESIGN.md §15 Q1`) |
