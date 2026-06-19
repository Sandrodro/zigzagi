import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PuzzleData } from "../../engine/types";
import { PlayView } from "../PlayView";

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

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.endsWith("/today")) return json(PUZZLE);
      if (url.endsWith("/check")) return json({ results: [{ row: 0, col: 0, correct: true }] });
      return json({});
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

  it("checking applies server results to the grid", async () => {
    renderPlayView();
    await waitFor(() => screen.getByTestId("cell-0-0"));

    await userEvent.click(screen.getByTestId("cell-0-0"));
    await userEvent.keyboard("ა");
    await userEvent.click(screen.getByRole("button", { name: /check/i }));

    await waitFor(() =>
      expect(screen.getByTestId("cell-0-0")).toHaveAttribute("data-status", "correct"),
    );
  });
});
