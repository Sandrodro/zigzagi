import type { Cell, CellStatus, ClueRef, Direction, NumberedCell, PuzzleData, Scope } from "./types";

const key = (row: number, col: number) => `${row},${col}`;

export class CrosswordEngine {
  private readonly puzzle: PuzzleData;
  private readonly blocks: Set<string>;
  private readonly absent: Set<string>;
  private values: Record<string, string> = {};
  private statuses: Record<string, CellStatus> = {};
  private _active: Cell = { row: 0, col: 0 };
  private _direction: Direction = "across";

  constructor(puzzle: PuzzleData) {
    this.puzzle = puzzle;
    this.blocks = new Set(puzzle.blocks.map(([r, c]) => key(r, c)));
    this.absent = new Set((puzzle.absent ?? []).map(([r, c]) => key(r, c)));
    outer: for (let r = 0; r < puzzle.size.rows; r++) {
      for (let c = 0; c < puzzle.size.cols; c++) {
        if (this.playable(r, c)) {
          this._active = { row: r, col: c };
          break outer;
        }
      }
    }
    if (!this.currentClue()) this._direction = "down";
  }

  get size() { return this.puzzle.size; }
  get active(): Cell { return this._active; }
  get direction(): Direction { return this._direction; }

  isBlock(row: number, col: number): boolean {
    return this.blocks.has(key(row, col));
  }

  isAbsent(row: number, col: number): boolean {
    return this.absent.has(key(row, col));
  }

  private inBounds(row: number, col: number): boolean {
    return row >= 0 && col >= 0 && row < this.puzzle.size.rows && col < this.puzzle.size.cols;
  }

  private playable(row: number, col: number): boolean {
    return this.inBounds(row, col) && !this.isBlock(row, col) && !this.isAbsent(row, col);
  }

  getValue(row: number, col: number): string {
    return this.values[key(row, col)] ?? "";
  }

  getStatus(row: number, col: number): CellStatus {
    const explicit = this.statuses[key(row, col)];
    if (explicit) return explicit;
    return this.getValue(row, col) ? "filled" : "empty";
  }

  setActive(row: number, col: number): void {
    if (!this.playable(row, col)) return;
    this._active = { row, col };
    // If the current direction has no clue at this cell (unchecked cell), try the other.
    if (!this.currentClue()) {
      this._direction = this._direction === "across" ? "down" : "across";
    }
  }

  toggleDirection(): void {
    const other: Direction = this._direction === "across" ? "down" : "across";
    // Only flip if a clue exists in the other direction at the active cell.
    if (this.clueForCell(this._active.row, this._active.col, other)) {
      this._direction = other;
    }
  }

  type(letter: string): void {
    const { row, col } = this._active;
    if (!this.playable(row, col)) return;
    this.values[key(row, col)] = letter;
    delete this.statuses[key(row, col)];
    const next = this._direction === "across" ? { row, col: col + 1 } : { row: row + 1, col };
    if (this.playable(next.row, next.col)) this._active = next;
  }

  backspace(): void {
    const { row, col } = this._active;
    if (this.getValue(row, col)) {
      this.values[key(row, col)] = "";
      delete this.statuses[key(row, col)];
      return;
    }
    const prev = this._direction === "across" ? { row, col: col - 1 } : { row: row - 1, col };
    if (this.playable(prev.row, prev.col)) {
      this._active = prev;
      this.values[key(prev.row, prev.col)] = "";
      delete this.statuses[key(prev.row, prev.col)];
    }
  }

  move(dir: "up" | "down" | "left" | "right"): void {
    const deltas = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }[dir];
    const next = { row: this._active.row + deltas[0], col: this._active.col + deltas[1] };
    if (this.playable(next.row, next.col)) this._active = next;
  }

  currentWordCells(): Cell[] {
    const cells: Cell[] = [];
    const stepRow = this._direction === "down" ? 1 : 0;
    const stepCol = this._direction === "across" ? 1 : 0;
    let { row, col } = this._active;
    while (this.playable(row - stepRow, col - stepCol)) { row -= stepRow; col -= stepCol; }
    while (this.playable(row, col)) { cells.push({ row, col }); row += stepRow; col += stepCol; }
    return cells;
  }

  getFills(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.values)) { if (v) out[k] = v; }
    return out;
  }

  numberedCells(): NumberedCell[] {
    return this.puzzle.cells;
  }

  applyCheck(results: { row: number; col: number; correct: boolean }[]): void {
    for (const r of results) {
      this.statuses[key(r.row, r.col)] = r.correct ? "correct" : "incorrect";
    }
  }

  applyReveal(cells: { row: number; col: number; value: string }[]): void {
    for (const c of cells) {
      this.values[key(c.row, c.col)] = c.value;
      this.statuses[key(c.row, c.col)] = "revealed";
    }
  }

  private allPlayableCells(): Cell[] {
    const cells: Cell[] = [];
    for (let r = 0; r < this.puzzle.size.rows; r++) {
      for (let c = 0; c < this.puzzle.size.cols; c++) {
        if (this.playable(r, c)) cells.push({ row: r, col: c });
      }
    }
    return cells;
  }

  private wordStart(row: number, col: number, dir: Direction): Cell {
    const stepRow = dir === "down" ? 1 : 0;
    const stepCol = dir === "across" ? 1 : 0;
    while (this.playable(row - stepRow, col - stepCol)) {
      row -= stepRow;
      col -= stepCol;
    }
    return { row, col };
  }

  clueForCell(row: number, col: number, dir: Direction): ClueRef | null {
    if (!this.playable(row, col)) return null;
    const start = this.wordStart(row, col, dir);
    const list = this.puzzle.clues[dir];
    return list.find((c) => c.cell[0] === start.row && c.cell[1] === start.col) ?? null;
  }

  currentClue(): ClueRef | null {
    return this.clueForCell(this._active.row, this._active.col, this._direction);
  }

  private orderedClues(): { dir: Direction; clue: ClueRef }[] {
    return [
      ...this.puzzle.clues.across.map((clue) => ({ dir: "across" as Direction, clue })),
      ...this.puzzle.clues.down.map((clue) => ({ dir: "down" as Direction, clue })),
    ];
  }

  private gotoClueByOffset(delta: number): void {
    const ordered = this.orderedClues();
    if (ordered.length === 0) return;
    const cur = this.currentClue();
    let idx = ordered.findIndex(
      (o) => o.dir === this._direction && cur !== null && o.clue.number === cur.number,
    );
    if (idx === -1) idx = 0;
    const target = ordered[(idx + delta + ordered.length) % ordered.length];
    this._direction = target.dir;
    this._active = { row: target.clue.cell[0], col: target.clue.cell[1] };
  }

  nextClue(): void {
    this.gotoClueByOffset(1);
  }

  prevClue(): void {
    this.gotoClueByOffset(-1);
  }

  isComplete(): boolean {
    return this.allPlayableCells().every((c) => this.getValue(c.row, c.col) !== "");
  }

  cellsForScope(scope: Scope): Cell[] {
    if (scope === "square") return [{ ...this._active }];
    if (scope === "word") return this.currentWordCells();
    return this.allPlayableCells();
  }

  loadFills(fills: Record<string, string>): void {
    for (const [k, v] of Object.entries(fills)) {
      if (v) this.values[k] = v;
    }
  }
}
