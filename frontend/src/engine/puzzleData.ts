import type { SlotDto, TemplateDto } from "../api/admin";
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
    cells: [...seen.values()],
    clues: { across: [], down: [] },
  };
}
