import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PuzzleData } from "../engine/types";
import * as api from "../api/play";
import { PlayView } from "./PlayView";

const PUZZLE: PuzzleData = {
  date: "2026-06-18",
  theme: "დემო",
  size: { rows: 5, cols: 5 },
  blocks: [],
  cells: [{ row: 0, col: 0, number: 1 }],
  clues: {
    across: [{ number: 1, cell: [0, 0], length: 5, text: "1A" }],
    down: [{ number: 1, cell: [0, 0], length: 5, text: "1D" }],
  },
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(api, "fetchToday").mockResolvedValue(PUZZLE);
});

describe("PlayView", () => {
  it("renders the grid from the API", async () => {
    render(<PlayView />);
    await waitFor(() => expect(screen.getByTestId("cell-0-0")).toBeInTheDocument());
  });

  it("checking applies server results to the grid", async () => {
    vi.spyOn(api, "checkCells").mockResolvedValue({
      results: [{ row: 0, col: 0, correct: true }],
    });
    render(<PlayView />);
    await waitFor(() => screen.getByTestId("cell-0-0"));

    await userEvent.click(screen.getByTestId("cell-0-0"));
    await userEvent.keyboard("ა");
    await userEvent.click(screen.getByRole("button", { name: /check/i }));

    await waitFor(() =>
      expect(screen.getByTestId("cell-0-0")).toHaveAttribute("data-status", "correct"),
    );
  });
});
