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
  date: string;
  theme: string;
  size: { rows: number; cols: number };
  blocks: [number, number][];
  cells: NumberedCell[];
  clues: { across: ClueRef[]; down: ClueRef[] };
}

export type CellStatus = "empty" | "filled" | "correct" | "incorrect" | "revealed";
