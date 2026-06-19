# Zigzagi Implementation Plans — Index & Sequencing

These plans decompose DESIGN.md into independently-buildable subsystems. Each plan
produces working, testable software on its own. Build in dependency order.

> **For the full execution order, parallelization, blockers, and cross-plan touch-ups, see
> [`ROADMAP.md`](ROADMAP.md).** The table below is the quick index.

| # | Plan | Fidelity | Depends on | Status |
| - | ---- | -------- | ---------- | ------ |
| 1 | [Walking Skeleton](2026-06-18-walking-skeleton.md) | Bite-sized | — | Ready |
| 2 | [Solver](2026-06-18-solver.md) | Bite-sized | 1 (Puzzle/Entry models, worker seam) | Ready |
| 3 | [Sourcing & Pool](2026-06-18-sourcing-pool.md) | Bite-sized | 1 | Ready |
| 4 | [Clues](2026-06-18-clues.md) | Bite-sized | 1, 2 (Entry rows exist) | Ready |
| 5 | [Publishing & Scheduling](2026-06-18-publishing.md) | Bite-sized | 1, 2 | Ready |
| 6 | [Play View (full)](2026-06-18-play-full.md) | Outline | 1 | Expand on demand |
| 7 | [Auth + Progress Merge + Streak](2026-06-18-auth-progress-merge.md) | Outline | 1, 6 | Expand on demand |
| 8 | [Hardening](2026-06-18-hardening.md) | Outline | all | Expand on demand |

**Critical path (DESIGN.md §7):** 1 → 2 → 6. Sourcing (3) and Clues (4) overlap. Wordlist
acquisition (DESIGN.md §6.8, Open Q1) is a **procurement/legal blocker** that must start in
parallel with Plan 1 — it is *not* a coding task and gates Plan 2's real-data perf.

**Decisions baked in (from the planning conversation):**
- Solver is **pure Python** (DESIGN.md §6.4) modeling the `paulgb/crossword-composer`
  algorithm; a perf benchmark gates it (no Rust for MVP).
- Solver fill is an **async worker job** + `/jobs/{id}` polling (DESIGN.md §6.2), and
  grids come from a **curated template library** (DESIGN.md §6.3).
- AI tasks use Google **Gemini** (Flash for extraction/suggestion, Pro for clues,
  DESIGN.md §4.7) via the `google-genai` SDK with JSON-schema structured output, behind a
  thin client interface so tests never hit the network.

**Open questions still blocking (DESIGN.md §15):** Q1 wordlist source/license, Q4 RFE/RL
ToS sign-off (gates the scraper portion of Plan 3 — paste ingestion has no such blocker).
