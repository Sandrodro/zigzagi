export type Direction = "across" | "down";

export interface Cell {
  row: number;
  col: number;
}

export interface NumberedCell extends Cell {
  number: number;
}

export interface ClueRef {
  number: number;
  cell: [number, number];
  length: number;
  text: string;
}

export interface PuzzleData {
  id: string;
  date: string;
  size: { rows: number; cols: number };
  blocks: [number, number][];
  absent?: [number, number][]; // cells outside the puzzle shape (empty background)
  cells: NumberedCell[];
  clues: { across: ClueRef[]; down: ClueRef[] };
}

export type CellStatus = "empty" | "filled" | "correct" | "incorrect" | "revealed";

export type Scope = "square" | "word" | "puzzle";
