import type { PuzzleDetail, PuzzleEntry, SlotDto, TemplateDto } from "../api/admin";
import type { NumberedCell, PuzzleData } from "./types";

export const slotKey = (s: { number: number; direction: "across" | "down" }): string =>
  `${s.number}${s.direction === "across" ? "A" : "D"}`;

/**
 * Turn an admin TemplateDto into the PuzzleData shape the play-side
 * CrosswordEngine/Grid consume. Pure — no clue text (empty arrays) since
 * templates carry only structure. Numbered cells are derived from the slots'
 * start coordinates, deduped by {row,col}.
 */
export function templateToPuzzleData(t: TemplateDto): PuzzleData {
  const seen = new Map<string, NumberedCell>();
  for (const s of t.slots as SlotDto[]) {
    const k = `${s.row},${s.col}`;
    if (!seen.has(k)) seen.set(k, { row: s.row, col: s.col, number: s.number });
  }
  return {
    id: t.id,
    date: "",
    theme: "",
    size: { rows: t.rows, cols: t.cols },
    blocks: t.blocks,
    absent: t.absent ?? [],
    cells: [...seen.values()],
    clues: { across: [], down: [] },
  };
}

interface GridTemplate {
  rows: number;
  cols: number;
  blocks: [number, number][];
  absent?: [number, number][];
  cells: { row: number; col: number; number: number }[];
}

/**
 * Turn an admin PuzzleDetail into the PuzzleData shape the play-side
 * CrosswordEngine/Grid consume. Returns null when the puzzle has no filled
 * grid (e.g. an unfilled draft whose `grid_template` is `{}`).
 */
export function puzzleDetailToPuzzleData(d: PuzzleDetail): PuzzleData | null {
  const gt = d.grid_template as Partial<GridTemplate> | null | undefined;
  if (!gt || typeof gt.rows !== "number") return null;
  return {
    id: d.id,
    date: d.live_date,
    theme: d.theme,
    size: { rows: gt.rows, cols: gt.cols ?? 0 },
    blocks: gt.blocks ?? [],
    absent: gt.absent ?? [],
    cells: (gt.cells ?? []).map((c): NumberedCell => ({ row: c.row, col: c.col, number: c.number })),
    clues: { across: [], down: [] },
  };
}

/**
 * Build the per-cell fills map (`"r,c" -> letter`) from a puzzle's answers,
 * walking each entry's answer across (+col) or down (+row) from its start.
 */
export function answerFills(entries: PuzzleEntry[]): Record<string, string> {
  const fills: Record<string, string> = {};
  for (const e of entries) {
    for (let i = 0; i < e.answer.length; i++) {
      const r = e.direction === "across" ? e.row : e.row + i;
      const c = e.direction === "across" ? e.col + i : e.col;
      fills[`${r},${c}`] = e.answer[i];
    }
  }
  return fills;
}
