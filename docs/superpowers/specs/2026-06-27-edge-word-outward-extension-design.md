# Edge-word outward extension — design

## Goal

Derive new 11×11-based templates from `11x11-001/002/003` where every
short edge word is lengthened to the most common lemma length. A 3-letter
word whose run *ends on the grid boundary in its own direction* is extended
**outward, past that boundary**, to length **7** (the most common length in
the lemmas wordpool: 2115 of 12,544 words). The grid grows; cells in the new
margin that aren't part of an extended word are **absent** (rendered as empty
background, not black).

## Which words qualify

A 3-letter word is extended iff it runs straight into the boundary it touches:

- **across** word with first cell at col 0 → grow **left**; or last cell at
  col `cols-1` → grow **right**.
- **down** word with first cell at row 0 → grow **up**; or last cell at row
  `rows-1` → grow **down**.

A horizontal word merely *ending* on a side edge counts (it grows along its
own row); an across word that only *sits on* row 0/10 does not. Qualifying
words always come in 180°-symmetric pairs that grow in opposite directions, so
symmetry is preserved automatically. Same-line pairs (e.g. 002 #16A/#18A in
row 5) grow in opposite directions and never collide.

Counts: 001 → 6 words (3 pairs, all across), 002 → 8 (4 pairs, across+down),
003 → 2 (1 pair, across).

## Data model: `absent` cells

- Each extension adds `7 - 3 = 4` cells outside the original boundary.
  Left/up growth produces negative coords → renormalize so all coords ≥ 0;
  `rows`/`cols` grow to the new bounding box.
- New template JSON field `absent: [[r,c],...]` = cells inside the bounding
  box that are **not part of the puzzle** (the margin around protrusions).
- A cell in the new rectangle is exactly one of: **real block** (black),
  **playable** (white), or **absent** (background).

### Backend (solver stays unchanged)

`load_library` folds `absent` into `Template.blocks` so `_runs`, `numbering`,
and the solver treat absent cells as non-playable with **zero changes** to
those modules, and also stores them in a new `Template.absent` field.

- `validate_template`: skip the area-based slot-density band when
  `t.absent` is non-empty (the band assumes a solid rectangle and is
  redundant — we verify fill directly). Symmetry, connectivity, and
  min-word-length ≥ 3 still apply and still hold.
- `grid_template_from` and `list_template_dtos`: emit `blocks` =
  `sorted(blocks − absent)` (real black only) and a separate `absent` list.

### Frontend

- `TemplateDto`, `PuzzleData`, `GridTemplate` adapter, and `CrosswordEngine`
  gain `absent`. The engine excludes absent cells from playability,
  numbering, navigation, and the initial active cell.
- `Grid.tsx`: absent cell → render nothing; real block → black; else white.
  All renderers (Play, admin detail, builder) go through `Grid`, so one change
  covers everything.

## Build script

`scripts/extend_edge_words.py` (one-shot): reads 001/002/003, applies the
transform, and writes `11x11-004/005/006.json`. It asserts, per output:

1. no 3-letter edge word remains (every qualifying word is now length 7),
2. `blocks ∪ absent` is 180°-symmetric,
3. no word run of length < 3 was created,
4. playable cells are connected.

Then it runs a real `fill()` against the lemmas wordpool and prints the
status per template (report, not a gate — protrusion cells are unchecked, so
fills are expected to succeed).

## Checks left behind

- Backend test: 004/005/006 load, pass `validate_template`, are symmetric, and
  contain no 3-letter edge word.
- Frontend test: a template with an absent cell renders no rect for it.

## Out of scope

No generator/CLI flag for this mode (one-shot script); no DB migration
(templates are files). Names stay `11x11-004/005/006` though dimensions differ.
