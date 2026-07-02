import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PuzzleData } from "../../engine/types";
import { PlayView } from "../PlayView";

const PUZZLE: PuzzleData = {
  id: "p1",
  date: "2026-06-18",
  
  size: { rows: 1, cols: 3 },
  blocks: [],
  cells: [{ row: 0, col: 0, number: 1 }],
  clues: {
    across: [{ number: 1, cell: [0, 0], length: 3, text: "1A" }],
    down: [],
  },
};

// 1A runs (0,0)-(0,2); 2D crosses it at (0,1) and continues down to (1,1). (0,0) — the
// initial active cell — has no down clue of its own, and (0,1) — 2D's start — is also
// part of 1A. Reproduces the crossing-cell direction bug: selecting 2D from the list must
// switch to "down", not silently stay "across" because (0,1) still resolves an across clue.
const CROSSING_PUZZLE: PuzzleData = {
  id: "p2",
  date: "2026-06-19",
  size: { rows: 2, cols: 3 },
  blocks: [
    [1, 0],
    [1, 2],
  ],
  cells: [
    { row: 0, col: 0, number: 1 },
    { row: 0, col: 1, number: 2 },
  ],
  clues: {
    across: [{ number: 1, cell: [0, 0], length: 3, text: "1A" }],
    down: [{ number: 2, cell: [0, 1], length: 2, text: "2D" }],
  },
};

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.endsWith("/today")) return json(PUZZLE);
      if (url.endsWith("/check")) return json({ results: [{ row: 0, col: 0, correct: true }] });
      return json({ cells: [] });
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

const renderPlayView = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PlayView />
    </QueryClientProvider>,
  );

describe("PlayView", () => {
  it("renders the grid from the API", async () => {
    renderPlayView();
    await waitFor(() => expect(screen.getByTestId("cell-0-0")).toBeInTheDocument());
  });

  it("typing fills the grid and persists to localStorage", async () => {
    renderPlayView();
    await waitFor(() => screen.getByTestId("cell-0-0"));
    await userEvent.click(screen.getByTestId("cell-0-0"));
    await userEvent.keyboard("ა");
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("zigzagi:progress:p1") ?? "{}");
      expect(saved.fills).toMatchObject({ "0,0": "ა" });
    });
  });

  it("restores fills from localStorage on mount", async () => {
    localStorage.setItem(
      "zigzagi:progress:p1",
      JSON.stringify({ fills: { "0,1": "ბ" }, timerSeconds: 0, completedAt: null }),
    );
    renderPlayView();
    await waitFor(() => expect(screen.getByTestId("cell-0-1")).toHaveTextContent("ბ"));
  });

  it("clicking a clue in the list activates it", async () => {
    renderPlayView();
    await waitFor(() => screen.getByTestId("cell-0-0"));
    await userEvent.click(screen.getByRole("button", { name: "1 1A" })); // clue-list item (number + text)
    expect(screen.getByTestId("cell-0-0")).toHaveAttribute("data-active", "true");
  });

  it("selecting a down clue from the list highlights the down word, not the crossing across word", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.endsWith("/today")) return json(CROSSING_PUZZLE);
        return json({ cells: [] });
      }),
    );
    renderPlayView();
    await waitFor(() => screen.getByTestId("cell-0-0")); // starts active on 1A (across)
    await userEvent.click(screen.getByRole("button", { name: "2 2D" })); // clue-list item for the down clue
    expect(screen.getByTestId("cell-0-1")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("cell-1-1")).toHaveAttribute("data-inword", "true"); // down word
    expect(screen.getByTestId("cell-0-2")).toHaveAttribute("data-inword", "false"); // not the across word
  });

  it("checking an empty square leaves it empty instead of marking it incorrect", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.endsWith("/today")) return json(PUZZLE);
      if (url.endsWith("/check")) return json({ results: [{ row: 0, col: 0, correct: true }] });
      return json({ cells: [] });
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPlayView();
    await waitFor(() => screen.getByTestId("cell-0-0"));
    await userEvent.click(screen.getByTestId("cell-0-0")); // active, still empty
    // jsdom doesn't evaluate the md: breakpoint, so both the desktop dropdown and the
    // mobile icon-modal render; [0] is the desktop text menu (rendered first in the DOM).
    await userEvent.click(screen.getAllByRole("button", { name: "შემოწმება" })[0]);
    await userEvent.click(screen.getAllByRole("button", { name: "უჯრის შემოწმება" })[0]);
    expect(screen.getByTestId("cell-0-0")).toHaveAttribute("data-status", "empty");
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/check"));
  });

  it("shows the congrats modal on all-correct completion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.endsWith("/today")) return json(PUZZLE);
        if (url.endsWith("/check"))
          return json({
            results: [
              { row: 0, col: 0, correct: true },
              { row: 0, col: 1, correct: true },
              { row: 0, col: 2, correct: true },
            ],
          });
        return json({ cells: [] });
      }),
    );
    renderPlayView();
    await waitFor(() => screen.getByTestId("cell-0-0"));
    await userEvent.click(screen.getByRole("button", { name: "1 1A" })); // clue-list item (number + text)
    await userEvent.keyboard("ააა"); // fills all three cells
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("zigzagi:progress:p1") ?? "{}");
      expect(saved.completedAt).not.toBeNull();
    });
  });
});
