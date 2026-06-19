import { describe, expect, it } from "vitest";

import { CrosswordEngine } from "../crossword";
import type { PuzzleData } from "../types";

const PUZZLE: PuzzleData = {
  date: "2026-06-18",
  theme: "დემო",
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
