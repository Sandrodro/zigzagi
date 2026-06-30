import { describe, expect, it } from "vitest";

import { CrosswordEngine } from "../crossword";
import type { PuzzleData } from "../types";

const PUZZLE: PuzzleData = {
  id: "p1",
  date: "2026-06-18",
  
  size: { rows: 5, cols: 5 },
  blocks: [],
  cells: [
    { row: 0, col: 0, number: 1 },
    { row: 0, col: 1, number: 2 },
    { row: 1, col: 0, number: 6 },
  ],
  clues: {
    across: [{ number: 1, cell: [0, 0], length: 5, text: "1A" }],
    down: [{ number: 1, cell: [0, 0], length: 5, text: "1D" }],
  },
};

describe("CrosswordEngine", () => {
  it("starts at 0,0 going across", () => {
    const e = new CrosswordEngine(PUZZLE);
    expect(e.active).toEqual({ row: 0, col: 0 });
    expect(e.direction).toBe("across");
  });

  it("toggles direction", () => {
    const e = new CrosswordEngine(PUZZLE);
    e.toggleDirection();
    expect(e.direction).toBe("down");
  });

  it("typing writes a letter and auto-advances across", () => {
    const e = new CrosswordEngine(PUZZLE);
    e.type("ა");
    expect(e.getValue(0, 0)).toBe("ა");
    expect(e.active).toEqual({ row: 0, col: 1 });
  });

  it("typing jumps over an already-filled cell to the next empty one", () => {
    const e = new CrosswordEngine(PUZZLE);
    e.setActive(0, 1);
    e.type("ბ"); // fills (0,1)
    e.setActive(0, 0);
    e.type("ა"); // fills (0,0); (0,1) occupied -> skip to (0,2)
    expect(e.getValue(0, 0)).toBe("ა");
    expect(e.active).toEqual({ row: 0, col: 2 });
  });

  it("does not advance past the last cell of the row", () => {
    const e = new CrosswordEngine(PUZZLE);
    e.setActive(0, 4);
    e.type("ე");
    expect(e.active).toEqual({ row: 0, col: 4 });
  });

  it("backspace clears and steps back", () => {
    const e = new CrosswordEngine(PUZZLE);
    e.type("ა"); // now at (0,1)
    e.backspace(); // clears (0,1) if empty -> steps to (0,0)? define: clear current, step back
    expect(e.active).toEqual({ row: 0, col: 0 });
  });

  it("currentWordCells returns the whole across row", () => {
    const e = new CrosswordEngine(PUZZLE);
    const cells = e.currentWordCells();
    expect(cells).toHaveLength(5);
    expect(cells[0]).toEqual({ row: 0, col: 0 });
    expect(cells[4]).toEqual({ row: 0, col: 4 });
  });

  it("getFills returns keyed letters", () => {
    const e = new CrosswordEngine(PUZZLE);
    e.type("ა");
    expect(e.getFills()).toEqual({ "0,0": "ა" });
  });

  it("move down changes the active row", () => {
    const e = new CrosswordEngine(PUZZLE);
    e.move("down");
    expect(e.active).toEqual({ row: 1, col: 0 });
  });
});

describe("CrosswordEngine check/reveal", () => {
  it("applyCheck marks correct and incorrect", () => {
    const e = new CrosswordEngine(PUZZLE);
    e.setActive(0, 0);
    e.type("ა"); // (0,0) filled, active -> (0,1)
    e.applyCheck([
      { row: 0, col: 0, correct: true },
      { row: 0, col: 1, correct: false },
    ]);
    expect(e.getStatus(0, 0)).toBe("correct");
    expect(e.getStatus(0, 1)).toBe("incorrect");
  });

  it("applyReveal writes the value and marks revealed", () => {
    const e = new CrosswordEngine(PUZZLE);
    e.applyReveal([{ row: 0, col: 0, value: "ა" }]);
    expect(e.getValue(0, 0)).toBe("ა");
    expect(e.getStatus(0, 0)).toBe("revealed");
  });

  it("typing over a checked cell clears its status", () => {
    const e = new CrosswordEngine(PUZZLE);
    e.applyCheck([{ row: 0, col: 0, correct: false }]);
    e.setActive(0, 0);
    e.type("ბ");
    expect(e.getStatus(0, 0)).toBe("filled");
  });
});

const CLUE_PUZZLE: PuzzleData = {
  id: "p2",
  date: "2026-06-18",
  
  size: { rows: 3, cols: 3 },
  // middle of the right column is a block: (1,2)
  blocks: [[1, 2]],
  cells: [
    { row: 0, col: 0, number: 1 },
    { row: 0, col: 1, number: 2 },
    { row: 0, col: 2, number: 3 },
    { row: 1, col: 0, number: 4 },
    { row: 2, col: 0, number: 5 },
  ],
  clues: {
    across: [
      { number: 1, cell: [0, 0], length: 3, text: "1A" },
      { number: 4, cell: [1, 0], length: 2, text: "4A" },
      { number: 5, cell: [2, 0], length: 2, text: "5A" },
    ],
    down: [
      { number: 1, cell: [0, 0], length: 3, text: "1D" },
      { number: 2, cell: [0, 1], length: 3, text: "2D" },
      { number: 3, cell: [0, 2], length: 1, text: "3D" },
    ],
  },
};

// Puzzle where (1,0) and (2,0) are only part of a DOWN word — no across run.
const UNCHECKED_PUZZLE: PuzzleData = {
  id: "p3",
  date: "2026-06-18",
  
  size: { rows: 3, cols: 2 },
  blocks: [[1, 1], [2, 1]],
  cells: [
    { row: 0, col: 0, number: 1 },
    { row: 0, col: 1, number: 2 },
  ],
  clues: {
    across: [{ number: 1, cell: [0, 0], length: 2, text: "1A" }],
    down: [
      { number: 1, cell: [0, 0], length: 3, text: "1D" },
    ],
  },
};

describe("CrosswordEngine unchecked cells", () => {
  it("setActive auto-switches direction when no clue exists in current direction", () => {
    const e = new CrosswordEngine(UNCHECKED_PUZZLE);
    expect(e.direction).toBe("across");
    e.setActive(1, 0); // (1,0) has no across clue
    expect(e.currentClue()).not.toBeNull();
    expect(e.direction).toBe("down");
  });

  it("toggleDirection does not flip when other direction has no clue", () => {
    const e = new CrosswordEngine(UNCHECKED_PUZZLE);
    e.setActive(1, 0); // auto-switches to "down"
    e.toggleDirection(); // no across clue here — should stay "down"
    expect(e.direction).toBe("down");
    expect(e.currentClue()).not.toBeNull();
  });
});

describe("CrosswordEngine clue model", () => {
  it("currentClue tracks the active cell and direction", () => {
    const e = new CrosswordEngine(CLUE_PUZZLE);
    e.setActive(0, 1); // inside 1-Across and 2-Down
    expect(e.currentClue()?.number).toBe(1); // across by default
    e.toggleDirection();
    expect(e.currentClue()?.number).toBe(2); // now down
  });

  it("clueForCell finds the word's owning clue", () => {
    const e = new CrosswordEngine(CLUE_PUZZLE);
    expect(e.clueForCell(2, 1, "across")?.number).toBe(5);
    expect(e.clueForCell(1, 0, "down")?.number).toBe(1);
  });

  it("nextClue/prevClue walk the combined across-then-down order", () => {
    const e = new CrosswordEngine(CLUE_PUZZLE);
    e.setActive(0, 0); // 1-Across
    e.nextClue();
    expect(e.currentClue()?.number).toBe(4);
    e.prevClue();
    expect(e.currentClue()?.number).toBe(1);
  });

  it("nextClue switches direction at the across/down boundary", () => {
    const e = new CrosswordEngine(CLUE_PUZZLE);
    e.setActive(2, 0); // 5-Across, the last across clue
    e.nextClue();
    expect(e.direction).toBe("down");
    expect(e.currentClue()?.number).toBe(1); // first down clue
  });

  it("isComplete is true only when every playable cell is filled", () => {
    const e = new CrosswordEngine(CLUE_PUZZLE);
    expect(e.isComplete()).toBe(false);
    // 8 playable cells (9 minus the (1,2) block)
    const playable: [number, number][] = [
      [0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [2, 0], [2, 1], [2, 2],
    ];
    for (const [r, c] of playable) {
      e.setActive(r, c);
      e.type("ა");
    }
    expect(e.isComplete()).toBe(true);
  });

  it("cellsForScope returns square, word, and whole-puzzle cell sets", () => {
    const e = new CrosswordEngine(CLUE_PUZZLE);
    e.setActive(0, 1);
    expect(e.cellsForScope("square")).toEqual([{ row: 0, col: 1 }]);
    expect(e.cellsForScope("word")).toEqual([
      { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 },
    ]);
    expect(e.cellsForScope("puzzle")).toHaveLength(8);
  });

  it("clear empties values and statuses for the given scope only", () => {
    const e = new CrosswordEngine(CLUE_PUZZLE);
    e.loadFills({ "0,0": "ა", "0,1": "ბ", "0,2": "გ", "1,0": "დ" });
    e.applyCheck([{ row: 0, col: 0, correct: false }]);
    e.setActive(0, 1); // across word = row 0, cols 0..2
    e.clear("word");
    expect(e.getValue(0, 0)).toBe("");
    expect(e.getValue(0, 2)).toBe("");
    expect(e.getStatus(0, 0)).toBe("empty"); // status cleared too
    expect(e.getValue(1, 0)).toBe("დ"); // outside the word, untouched
  });

  it("loadFills overwrites values from a persisted dict", () => {
    const e = new CrosswordEngine(CLUE_PUZZLE);
    e.loadFills({ "0,0": "ა", "1,1": "ბ" });
    expect(e.getValue(0, 0)).toBe("ა");
    expect(e.getValue(1, 1)).toBe("ბ");
  });
});
