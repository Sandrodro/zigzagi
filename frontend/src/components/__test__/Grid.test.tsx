import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CrosswordEngine } from "../../engine/crossword";
import type { PuzzleData } from "../../engine/types";
import { Grid } from "../Grid";

const PUZZLE: PuzzleData = {
  id: "p1",
  date: "2026-06-18",
  theme: "დემო",
  size: { rows: 5, cols: 5 },
  blocks: [],
  cells: [{ row: 0, col: 0, number: 1 }],
  clues: { across: [], down: [] },
};

describe("Grid", () => {
  it("renders one cell per grid square", () => {
    render(<Grid engine={new CrosswordEngine(PUZZLE)} onCellClick={() => {}} />);
    expect(screen.getByTestId("cell-0-0")).toBeInTheDocument();
    expect(screen.getByTestId("cell-4-4")).toBeInTheDocument();
  });

  it("shows the clue number on numbered cells", () => {
    render(<Grid engine={new CrosswordEngine(PUZZLE)} onCellClick={() => {}} />);
    expect(screen.getByTestId("cell-0-0")).toHaveTextContent("1");
  });

  it("marks the active cell", () => {
    render(<Grid engine={new CrosswordEngine(PUZZLE)} onCellClick={() => {}} />);
    expect(screen.getByTestId("cell-0-0")).toHaveAttribute("data-active", "true");
  });

  it("calls onCellClick with coordinates", async () => {
    const onClick = vi.fn();
    render(<Grid engine={new CrosswordEngine(PUZZLE)} onCellClick={onClick} />);
    await userEvent.click(screen.getByTestId("cell-2-3"));
    expect(onClick).toHaveBeenCalledWith(2, 3);
  });

  it("renders nothing for absent cells (no cell, no block)", () => {
    const withAbsent: PuzzleData = {
      ...PUZZLE,
      absent: [[0, 0]],
      cells: [{ row: 0, col: 1, number: 1 }],
    };
    const { container } = render(
      <Grid engine={new CrosswordEngine(withAbsent)} onCellClick={() => {}} />,
    );
    expect(screen.queryByTestId("cell-0-0")).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-block="true"]')).toHaveLength(0);
    expect(screen.getByTestId("cell-0-1")).toBeInTheDocument();
  });
});
