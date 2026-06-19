# PRD — Zigzagi: Georgian AI-Powered Crossword Game

**Status:** Draft v0.1
**Date:** 2026-06-18
**Owner:** sandrogach@gmail.com

---

## 1. Executive Summary

**Problem Statement**
There is no modern, NYT-quality crossword experience for the Georgian language. Building Georgian crosswords by hand is slow, and there is no tooling that turns fresh Georgian-language text into playable, themed puzzles.

**Proposed Solution**
A web platform with two surfaces: an **Admin Studio** that ingests Georgian text (pasted, or scraped from a small set of news/literary sites from the last month), builds a vetted word pool with AI assistance, assembles a themed grid using a deterministic algorithmic solver (no AI), and generates NYT-Monday-style clues via Gemini; and a **Play** view modeled on the NYT Crossword app, serving one daily puzzle over a calm, hazy animated background.

**Success Criteria (MVP)**
1. Admin can go from "theme + word pool" to a published, solvable ~13×13 / 40–50-word puzzle in **≤ 15 minutes of human time**.
2. Algorithmic solver fills a valid symmetric grid in **≥ 90% of attempts** within **≤ 10 seconds**, placing **all required sourced/theme seed words** (min count per puzzle, see §4.3) and filling the remaining slots from the curated general Georgian wordlist.
3. **≥ 80%** of AI-generated clues are accepted by the admin with **no edit or minor edit only** (tracked via accept/edit/reject buttons).
4. Play view loads and is interactive (first puzzle cell focusable) in **≤ 2.0 s** on a mid-range mobile device; background animation holds **≥ 50 fps** and auto-disables under `prefers-reduced-motion`.
5. A player can complete and "check/reveal" a puzzle end-to-end on mobile and desktop with **zero blocking bugs** in the core solve loop.

---

## 2. User Experience & Functionality

### 2.1 Personas

- **Constructor/Admin (primary):** Georgian-literate editor who curates words, sets themes, reviews AI clues, and publishes the daily puzzle. Wants speed and final editorial control.
- **Player (primary):** Georgian speaker who wants a relaxing daily crossword like the NYT app. May play anonymously or sign in to keep streaks/progress.
- **Returning player w/ account (secondary):** Wants cross-device sync of progress, completion time, and streaks.

### 2.2 Core User Flow (Admin)

```
Paste text  ─┐
             ├─► AI word extraction ─► Word Pool (reviewed/edited) ─► Set Theme
Scrape feed ─┘        ▲                      │
                      │ AI suggestions       ▼
                 (theme + existing      Algorithmic Solver (deterministic)
                  words context)             │
                                             ▼
                                     Filled Grid (symmetric)
                                             │
                                  Gemini Pro clue generation
                                             │
                                  Admin reviews/edits clues
                                             │
                                  Schedule + Publish (date)
                                             │
                                             ▼
                                   Daily puzzle available in Play
```

### 2.3 User Stories & Acceptance Criteria

**ADMIN — Word sourcing**

- **Story:** As an admin, I want to paste a block of Georgian text and have the AI extract candidate words, so I can quickly seed a pool.
  - **AC:** Paste box accepts ≥ 20k characters; extraction returns candidate words with: surface form, suggested dictionary/nominative form, length, and a short source snippet.
  - **AC:** Extraction is conditioned on the **current theme** and the **words already in the pool** (avoids duplicates, prefers thematically relevant terms).
  - **AC:** Only words composed solely of Georgian Mkhedruli letters (U+10D0–U+10FF) and within length **3–13** are offered; others are filtered with a visible count of what was dropped.
  - **AC:** Admin can bulk accept/reject and edit any word before it enters the pool.

- **Story:** As an admin, I want the system to scrape recent articles from selected Georgian sites, so the pool reflects current language.
  - **AC:** Sources for MVP are limited to **radiotavisupleba.ge** and **arilimag.ge**.
  - **AC:** Only articles published within the **last 31 days** are ingested; each candidate word retains a link/snippet to its source article.
  - **AC:** Scraping runs on demand (admin "Refresh sources" button) and on a daily schedule; failures for one source do not block the other.
  - **AC:** Raw article bodies are **not** republished or stored beyond what is needed for extraction + snippet attribution (see §4.4).

- **Story:** As an admin, I want AI word suggestions based on the theme and existing words, so I can fill gaps in the pool.
  - **AC:** "Suggest words" returns N candidates relevant to theme + existing pool, each flagged if it does/doesn't appear in the sourced corpus.
  - **AC:** Suggestions never auto-add; admin confirms.

**ADMIN — Grid construction**

- **Story:** As an admin, I want to pick a theme and have the system assemble a grid that prominently features my sourced words.
  - **AC:** Solver targets a **~13×13** grid, **40–50 entries**, with **180° rotational symmetry** of black squares and **minimum word length 3**. Full mutual interlock is **not** required for MVP (some unchecked letters allowed). This is an explicit MVP trade-off: true NYT grids are fully checked, so "NYT Monday style" here refers to size, register, and feel — not yet the complete construction ruleset (see v2.0).
  - **AC:** **Sourced/theme words are required seeds**: the puzzle must contain **≥ a configurable minimum** (default ~15–20) of pool words; the solver fills the remaining slots from a **curated general Georgian wordlist**. The admin can see which entries are off-corpus (general fill) vs. sourced.
  - **AC:** Solver is **fully deterministic code (no AI)** and reproducible given the same inputs + seed.
  - **AC:** If a fill fails, the admin sees a clear reason (e.g., "not enough seed words of length 3–5") and can adjust seeds or retry with a new seed.
  - **AC:** Admin can lock specific words to be included, regenerate, and manually edit black squares before finalizing.

**ADMIN — Clue generation**

- **Story:** As an admin, I want the AI to write NYT-Monday-style clues for the filled grid in Georgian, so I don't write 45 clues by hand.
  - **AC:** Each clue request includes the answer, theme, grid position/direction, and (when available) the source snippet for that word.
  - **AC:** Clues default to **NYT Monday register**: straightforward, definitional, accessible, minimal wordplay, in Georgian.
  - **AC:** Admin can **accept / edit / reject+regenerate** each clue; the choice is logged for the quality metric (Success Criteria #3).
  - **AC:** Publishing is blocked until every entry has an accepted clue.

**ADMIN — Publishing**

- **Story:** As an admin, I want to schedule a puzzle to a specific date, so the Play view shows one puzzle per day.
  - **AC:** Exactly one puzzle is "live" per calendar date; admin can schedule future dates and edit/unpublish before the live date.
  - **AC:** Because the Play view needs one puzzle **every day**, the system tracks the scheduled backlog and **warns the admin when fewer than N days (default 7) are queued**. The dashboard surfaces "days of runway remaining."
  - **AC:** A published puzzle is immutable in structure once its live date has passed (clue typo fixes allowed, structural edits create a new version).

**PLAYER — Solving**

- **Story:** As a player, I want to solve today's puzzle in an interface like the NYT app, so it feels familiar and pleasant.
  - **AC:** Grid renders Georgian letters; tapping a cell highlights the active word (across/down) and its clue; the clue bar shows the current clue with prev/next navigation.
  - **AC:** Across/Down clue lists are shown (sidebar on desktop, swipeable bar on mobile); selecting a clue focuses its first cell.
  - **AC:** On-screen Georgian keyboard on mobile; physical keyboard support on desktop; auto-advance within a word and skip-filled behavior.
  - **AC:** **Check** (square/word/puzzle) and **Reveal** (square/word/puzzle) available; **timer** with pause; "Congrats" state on correct completion.
  - **AC:** A subtle, hazy, "Balatro-esque" animated background runs behind the grid, is **non-distracting** (low contrast, slow motion), and disables under `prefers-reduced-motion` or a settings toggle.

- **Story:** As an anonymous player, I want my progress saved locally so I can close and reopen the tab.
  - **AC:** In-progress fills, timer, and check/reveal state persist in `localStorage` per puzzle date.

- **Story:** As a player, I want to optionally sign in to sync progress and keep a streak.
  - **AC:** Optional account; on sign-in, local progress for the current puzzle merges into the synced record.
  - **AC:** Streak = consecutive days with a completed puzzle; visible on a simple stats panel.

### 2.4 Non-Goals (MVP)

- No AI in grid construction — grid is algorithmic only.
- No full NYT construction ruleset (full interlock, no 2-letter words enforced beyond min-3, themed long-answer "theme entries", rebus, circles). Symmetry + min length only for MVP.
- No multi-language support (Georgian only).
- No social features (leaderboards, sharing, comments) beyond personal streak.
- No native mobile apps (responsive web only).
- No automated republishing of full source articles.
- No payments/subscriptions.

---

## 3. AI System Requirements

### 3.1 Models

| Task | Model | Rationale |
|---|---|---|
| Word extraction from pasted/scraped text | **Gemini 2.5 Flash** | High volume, cheap, fast; structured extraction is well within Flash capability. |
| Word suggestions (theme + pool) | **Gemini 2.5 Flash** | Lightweight generative task. |
| Clue generation | **Gemini 2.5 Pro** | Higher quality, register-sensitive Georgian text; clue quality drives KPI #3. |

All model assignments are configurable per task (env/config), so any task can be re-pointed without code changes.

### 3.2 AI Tasks & I/O Contracts

- **Extraction:** Input = raw text + theme + existing pool (for dedupe/relevance). Output = **structured JSON** (enforced via response schema): `[{surface, lemma, length, snippet, theme_relevance: 0–1}]`. Backend re-validates alphabet + length; AI output is never trusted directly into the grid.
- **Suggestion:** Input = theme + pool. Output = JSON list of candidate words + reason + `in_corpus: bool`.
- **Clue generation:** Input = `{answer, direction, number, theme, source_snippet?}` per entry, batched. Output = JSON `[{entry_id, clue}]` in Georgian, Monday register. Length and style constraints in the system prompt.

### 3.3 Evaluation Strategy

- **Extraction eval:** Curated set of 10 Georgian articles with a hand-labeled "good word" gold set. Target **Precision@all ≥ 0.7** (offered words that are valid, usable Georgian words) and **alphabet/length filter accuracy = 100%** (no invalid chars ever reach the pool).
- **Clue eval (human-in-the-loop):** Track admin accept/edit/reject rates in production; target **≥ 80% accept-or-minor-edit** (KPI #3). Maintain a benchmark of 50 (answer, theme) pairs reviewed by a Georgian speaker; regression-check on prompt changes.
- **Solver is not AI** — validated by deterministic unit tests (see §4), not model evals.
- **Safety/format:** All AI calls use **structured-output / JSON schema** mode; malformed responses trigger one bounded retry, then surface an error to the admin (never auto-publish on AI failure).

---

## 4. Technical Specifications

### 4.1 Stack

- **Frontend:** React (TypeScript). Reusable component library for grid, clue bar/lists, keyboard, and admin tables. Canvas/WebGL shader for background animation.
- **Backend:** Python (FastAPI recommended) — REST/JSON API, async for scraping and Gemini calls.
- **AI:** Google Gemini (2.5 Flash / 2.5 Pro) via official SDK, structured-output mode.
- **DB / hosting:** **TBD** — design cloud-agnostic. Relational store assumed (puzzles, words, clues, users, progress). Background jobs for scheduled scraping.

### 4.2 Component Architecture & Data Flow

```
React (Play)  ─┐                        ┌─ Gemini Flash (extract/suggest)
React (Admin) ─┼─► FastAPI ─► Services ─┼─ Gemini Pro (clues)
               │      │                 ├─ Solver (pure Python, deterministic)
               │      │                 └─ Scrapers (radiotavisupleba, arilimag)
               │      ▼
               └─►  Relational DB  +  Scheduled job (daily scrape + daily publish)
```

Core entities (indicative):
- `WordCandidate(id, surface, lemma, length, source_url, snippet, theme_tags, status)`
- `Puzzle(id, date, theme, grid_template, status[draft/scheduled/published], seed)`
- `Entry(id, puzzle_id, number, direction, answer, row, col, clue, clue_status, provenance[sourced|general-fill])`
- `WordlistEntry(id, word, length, status[active|blocked])` — curated general Georgian fill list
- `User(id, ...)` + `Progress(user_id|anon_id, puzzle_id, fills, timer, completed_at)`

### 4.3 Algorithmic Solver (no AI)

- **Word material (two tiers):**
  - **Seed words** — the sourced/manual pool. The solver must place ≥ the configured minimum; these are prioritized for placement (and ideally for longer/central slots).
  - **General fill wordlist** — a curated, vetted Georgian wordlist (target tens of thousands of entries) used to fill the remaining slots so the grid completes. This is what makes deterministic fill feasible; without it, ~70 sourced words cannot reliably fill 40–50 interlocking slots.
- **Symmetry-first template:** generate/select a 13×13 black-square pattern with 180° rotational symmetry, min word length 3, target 40–50 slots.
- **Fill:** backtracking / constraint-propagation filler; cross-letter constraints respected; seed words placed first, general wordlist used for the remainder; supports locked words and a random `seed` for reproducibility and "regenerate."
- **Guarantees:** deterministic given (seeds, wordlist, template, seed value); time-bounded (configurable, default ≤ 10 s) with graceful failure + diagnostic.
- **Provenance:** each placed entry is tagged `sourced` vs. `general-fill` so the admin and clue step know which is which.
- **Tests:** unit tests for symmetry validity, min-length, crossing consistency, seed-inclusion guarantee, fill success rate on representative inputs, and reproducibility.

### 4.4 Integration, Security & Privacy

- **Auth:** Admin Studio behind authentication. Player auth optional (anonymous default; optional account for sync). Anonymous progress keyed by a client-generated id in `localStorage`.
- **Scraping legality:** Restrict to radiotavisupleba.ge and arilimag.ge; honor robots.txt and rate-limit; store only extracted words + short attributed snippets + source URL, **not** full article bodies. Flag for human review of each site's ToS before launch (RFE/RL content rights). See Risks.
- **Secrets:** Gemini API keys server-side only; never shipped to the client. All AI calls proxied through the backend.
- **PII:** Minimal — only optional account email/credential. No article authors' personal data stored beyond public byline attribution.

---

## 5. Risks & Roadmap

### 5.1 Technical & Product Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Georgian morphology — words appear inflected in articles; crosswords want base forms | Pool quality / answers look wrong | AI returns lemma + surface; admin reviews; consider a Georgian lemmatizer later. |
| Solver can't complete fill from sourced words alone | Admin blocked / no puzzle | Two-tier word material: required seed words + a large curated general Georgian wordlist for the rest (§4.3); clear failure diagnostics; retry/seed; manual black-square edits. |
| Quality of the curated general Georgian wordlist (obscure/inflected/offensive entries) | Bad fill answers in grid | Vet the wordlist offline; tag/score entries; allow blocklist; admin reviews off-corpus entries before publish. |
| Daily-puzzle treadmill — one puzzle required every day | Empty Play view / churn | Schedule backlog with runway warning (< 7 days queued); batch-build sessions; future automation in v1.1+. |
| Scraping ToS / copyright (esp. RFE/RL) | Legal | Words-only extraction, snippets+attribution, robots.txt respect, pre-launch ToS review; design to disable a source quickly. |
| Clue quality below 80% accept | More admin time | Pro model + strong Monday-register prompt + few-shot Georgian examples; track metric; iterate prompt. |
| Background animation hurts performance/readability | Player churn | Strict perf budget (≥50fps), low contrast, `prefers-reduced-motion`, settings toggle. |
| Gemini latency/cost on batch clue gen | Slow publish / cost | Batch requests, cache, Flash for cheap tasks; show progress UI. |
| Georgian text input on mobile | Solve loop broken | Custom on-screen Georgian keyboard component; test across iOS/Android. |

### 5.2 Phased Rollout

- **MVP (v1.0):** Paste + scrape (2 sites), AI extract/suggest, curated general Georgian fill wordlist, deterministic symmetric solver (13×13, 40–50 words, seeds + fill), Pro clue gen with admin review, daily-puzzle Play view (NYT-like) with scheduling/runway, anonymous play + optional account, hazy background. Hosting/DB chosen (currently TBD).
- **v1.1:** Georgian lemmatizer integration; clue-quality dashboard; archive browsing for players; richer stats/streaks; admin analytics on AI accept rates.
- **v2.0:** **Full NYT construction constraints** (complete interlock, no unchecked cells, themed long entries); larger/true 15×15 Monday grids; more sources; difficulty tiers (Mon→Sat); puzzle sharing.

---

## Open Items (to confirm later)

- Final DB + hosting choice (currently **TBD**).
- Source of the curated general Georgian fill wordlist (existing open dataset vs. self-built) and its licensing.
- Minimum seed-word count per puzzle (default ~15–20 — tune after first fills).
- Admin authentication mechanism (single admin vs. multiple editors).
- Exact daily-publish timezone (assume Asia/Tbilisi).
- Whether optional accounts use email/password vs. OAuth (e.g., Google).
