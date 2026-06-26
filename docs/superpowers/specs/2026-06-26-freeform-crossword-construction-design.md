# Freeform Crossword Construction — Design

**Date:** 2026-06-26
**Status:** Approved (pending spec review)

## Problem

The current pipeline fixes a symmetric template grid, then fills it with a CSP
solver. This forces two things we don't want:

1. **Symmetry + fixed rectangle** constrain the achievable slot-length
   distribution. Empirically (this session), a slot distribution matching the
   lemma dataset (few short words, mostly length 5–9) requires dense,
   high-crossing-ratio square grids that the solver cannot fill on the lemma
   pool — or even the 54k generic pool — within 30s. "Few short slots" and
   "high crossing ratio" are the same axis, so the dataset-matching
   distribution is structurally unsolvable under the template+symmetry model.

The grid geometry, not vocabulary size, is the binding constraint.

## Goal

An **experimental** word-first construction system that builds an irregular
(non-symmetric) crossword incrementally by placing real dataset words, so the
puzzle's word lengths come from the dataset by construction. Target ~28 words at
~0.6 crossing density, drawn from the **lemma** pool by default.

This does not replace the template/CSP pipeline; it is an additional fill mode.

## Requirements (from brainstorming)

- **Crossing rule: real-crossword validity.** Dense interlock is allowed, but
  every *incidental* run of length ≥3 (a letter sequence formed as a side-effect
  of placing crossing words) must itself be a valid dataset word. Runs of length
  2 are tolerated as non-words (the dataset has no 1–2 letter words, and the
  existing `_runs` model already ignores runs <3).
- **Integration: full.** A new fill mode the worker runs as a Job, surfaced via
  a button in `/create`.
- **Targets are soft.** Aim for ~28 words and ~0.6 density; accept a band
  (≈24–30 words, density ≈0.5–0.7). Return best-effort within the band.
- **Algorithm: greedy grow + bounded backtracking** (the standard freeform
  construction algorithm; backtrack budget is a dial, 0 ⇒ pure greedy).
- **Deterministic.** Identical `(words, seed_value, params)` ⇒ identical puzzle.
- **Pure engine.** No SQLAlchemy/FastAPI imports in the construction module.

## Architecture

```
app/solver/freeform.py        # NEW — construction engine (pure)
app/services/solver_jobs.py   # branch run_fill_job on mode; add persist_freeform
app/routers/admin.py          # fill request carries mode="freeform" + word_count
app/worker.py                 # unchanged (loads wordpool, calls run_fill_job)
frontend/src/pages/PuzzleBuilder.tsx   # second "თავისუფალი ფორმა" button
frontend/src/api/admin.ts     # requestFill carries mode/word_count
```

**Engine public surface** (mirrors `FillResult`/`FillFailure` so persist and the
worker branch stay uniform):

```python
@dataclass
class FreeformResult:
    rows: int; cols: int
    blocks: list[tuple[int, int]]       # bounding-box cells with no letter
    grid: dict[tuple[int, int], str]    # normalized to [0,rows) × [0,cols)
    entries: list[FilledEntry]          # reuse FilledEntry from run.py
    density: float

def construct(words: list[str], seed_value: int, *,
              target_words: int = 28, target_density: float = 0.6,
              min_len: int = 3, seed_min_len: int = 10,
              min_words: int = 20, backtrack_budget: int = 2000,
              deadline_s: float = 20.0) -> FreeformResult | FillFailure
```

Reused as-is: `FilledEntry`, `FillFailure` (from `run.py`), `build_constraints`,
`number_cells`. `cross_ratio` is lifted from `scripts/gen_templates.py` into the
engine so both share one definition (the script imports it from there).

## Algorithm

**State** (unbounded integer lattice — shape emerges, no rows×cols fixed up front):

- `grid: dict[(r,c) -> letter]`
- `placed: list[Placement]`, `Placement = (word, r0, c0, direction)`
- Internal word index: a `set` for O(1) run-validity, plus length-bucketed lists
  for candidate scanning.

**Main loop** (seeded `random.Random(seed_value)` for every choice):

1. **Seed:** place a word of length ≥ `seed_min_len` (longest available if none)
   horizontally at the origin.
2. **Repeat** until `target_words` reached / density satisfied / deadline / budget:
   - **Frontier:** every cell of every placed word is a candidate site to hang a
     *perpendicular* word; walk sites in seeded-shuffled order.
   - **Candidates:** for site cell `(r,c)` with letter `L` and perpendicular
     direction `d`, scan dataset words/alignments where `L` lands on `(r,c)` and
     any other overlapped cells already match. Linear scan over relevant length
     buckets (~8.8k words is cheap).
   - **Validity gate** (accept only if all hold):
     - **a. Overlap:** every already-occupied cell under the word equals the
       word's letter.
     - **b. End-cap:** the cells immediately before the start and after the end
       (along `d`) are empty — no collinear merge into a longer run.
     - **c. Incidental runs:** for each cell of the new word, walk the
       *perpendicular* axis to the maximal occupied run through it; if length ≥3
       it must be in the dataset set. Length-2 runs tolerated as non-words.
   - **Selection (density + distribution lever):** among valid candidates, pick
     the one creating the most new fully-crossed cells (drives cross-ratio toward
     0.6); tie-break toward length 5–9, then seeded-random.
   - **Commit;** its cells become new frontier sites.
3. **Backtracking:** if the frontier is exhausted below `target_words`, undo the
   last placement, blacklist that `(site, word)` choice, continue — up to
   `backtrack_budget` (0 ⇒ pure greedy).
4. **Terminate:** on reaching ~`target_words` (and density ≥
   `target_density` − tolerance), return; on deadline/budget, return the best
   grid so far if word count ≥ `min_words`, else `FillFailure`. `min_words`
   (default 20) is the hard failure floor, set intentionally *below* the aim band
   (24–30) so near-band best-effort results still return rather than fail.

**Finalize:**

- **Normalize:** shift cells so min row/col = 0 ⇒ `rows`, `cols` = bounding box;
  `blocks` = box cells with no letter.
- **Density:** `cross_ratio` over occupied cells.
- **Entries:** run `build_constraints` on the normalized template and read
  letters from `grid` ⇒ `FilledEntry` list, `provenance="freeform"`. The validity
  gate guarantees every ≥3 run is a placed dataset word, so `build_constraints`
  reproduces exactly the placed word set (asserted in a test).

## Integration

**Job & worker.** Reuse the fill-Job machinery — no new Job kind. `enqueue_fill`
gains `mode` (default `"normal"`) and optional `word_count`/`target_density`,
stored in `Job.params`. `run_fill_job` branches early:

```python
if job.params.get("mode") == "freeform":
    result = construct(words, seed_value, target_words=..., target_density=...)
    # FillFailure -> job.failed; else persist_freeform + job.done
    return
# ... existing template path (including the template-not-found guard) ...
```

Freeform skips the template-not-found guard (no `template_id`). The worker
(`tick`/`run_forever`) is unchanged; it already loads the selected wordpool.

**Persist.** `persist_freeform(db, puzzle_id, result)` mirrors `persist_fill` but
takes grid dims/blocks from the result instead of a library template: sets
`puzzle.grid_template = {rows, cols, blocks, cells}` (cells via `number_cells` on
the normalized template) and appends an `Entry` per `FilledEntry`. Same DB shape
as today, so Play/admin rendering, clues, word-check, and publish work unchanged.

**/create UI.** A second button next to Generate — **„თავისუფალი ფორმა"** — posts
`requestFill` with `mode:"freeform"`, `word_count:28`, and the selected wordpool
(default lemmas). No template picker needed (shape is generated). Reuses the
existing job-poll + `<PuzzleEntries>` result view; the irregular grid renders via
`<Grid>`, which already draws arbitrary blocks as black cells.

## Determinism & edge cases

- All choices via `random.Random(seed_value)`; identical inputs ⇒ byte-identical
  output. Pure module.
- No long seed word → use the longest available.
- Stuck below `min_words` → `FillFailure("freeform: only N words")`.
- `deadline_s` caps runtime; empty pool → failure.

## Testing

Pure, no DB, in `tests/solver/`:

1. Validity gate rejects overlap mismatch, collinear merge, and invalid ≥3
   incidental runs.
2. `construct()` on a small synthetic word list returns a connected puzzle where
   every ≥3 run is in the list.
3. Determinism — same seed ⇒ identical result; different seeds ⇒ generally
   different.
4. Consistency — `build_constraints` over the output reproduces exactly the
   placed words.
5. Density computed correctly; word count lands in the band.

Plus service-level tests for the `freeform` Job branch and `persist_freeform`.

## Out of scope

- Beam/best-first search (approach C) — a later optimization if density needs
  pushing past what greedy+backtracking finds.
- Replacing the template/CSP pipeline — freeform is additive.
- Clue generation changes — freeform puzzles flow through the existing
  autoclue/clue paths unchanged.
