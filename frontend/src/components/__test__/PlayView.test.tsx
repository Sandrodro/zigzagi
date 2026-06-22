import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PuzzleData } from "../../engine/types";
import { PlayView } from "../PlayView";

const PUZZLE: PuzzleData = {
  date: "2026-06-18",
  theme: "დემო",
  size: { rows: 1, cols: 3 },
  blocks: [],
  cells: [{ row: 0, col: 0, number: 1 }],
  clues: {
    across: [{ number: 1, cell: [0, 0], length: 3, text: "1A" }],
    down: [],
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

  it("checking applies server results to the grid", async () => {
    renderPlayView();
    await waitFor(() => screen.getByTestId("cell-0-0"));
    await userEvent.click(screen.getByTestId("cell-0-0"));
    await userEvent.keyboard("ა");
    await userEvent.click(screen.getByRole("button", { name: "Check square" }));
    await waitFor(() =>
      expect(screen.getByTestId("cell-0-0")).toHaveAttribute("data-status", "correct"),
    );
  });

  it("typing fills the grid and persists to localStorage", async () => {
    renderPlayView();
    await waitFor(() => screen.getByTestId("cell-0-0"));
    await userEvent.click(screen.getByTestId("cell-0-0"));
    await userEvent.keyboard("ა");
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem("zigzagi:progress:2026-06-18") ?? "{}");
      expect(saved.fills).toMatchObject({ "0,0": "ა" });
    });
  });

  it("restores fills from localStorage on mount", async () => {
    localStorage.setItem(
      "zigzagi:progress:2026-06-18",
      JSON.stringify({ fills: { "0,1": "ბ" }, timerSeconds: 0, completedAt: null }),
    );
    renderPlayView();
    await waitFor(() => expect(screen.getByTestId("cell-0-1")).toHaveTextContent("ბ"));
  });

  it("clicking a clue in the list activates it", async () => {
    renderPlayView();
    await waitFor(() => screen.getByTestId("cell-0-0"));
    await userEvent.click(screen.getByRole("button", { name: /1A/ }));
    expect(screen.getByTestId("cell-0-0")).toHaveAttribute("data-active", "true");
  });

  it("check word posts exactly the current word's filled cells", async () => {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, opts?: RequestInit) => {
        calls.push({ url, body: opts?.body ? JSON.parse(opts.body as string) : null });
        if (url.endsWith("/today")) return json(PUZZLE);
        if (url.endsWith("/check")) return json({ results: [] });
        return json({ cells: [] });
      }),
    );
    renderPlayView();
    await waitFor(() => screen.getByTestId("cell-0-0"));
    // Select 1-Across (active at 0,0, direction across, input focused), then fill two cells.
    await userEvent.click(screen.getByRole("button", { name: /1A/ }));
    await userEvent.keyboard("ა");
    await userEvent.keyboard("ბ");
    await userEvent.click(screen.getByRole("button", { name: "Check word" }));

    const checkCall = calls.find((c) => c.url.endsWith("/check"));
    expect(checkCall?.body).toEqual({
      cells: [
        { row: 0, col: 0, value: "ა" },
        { row: 0, col: 1, value: "ბ" },
      ],
    });
  });

  it("reveal puzzle fills every cell from the server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.endsWith("/today")) return json(PUZZLE);
        if (url.endsWith("/reveal"))
          return json({
            cells: [
              { row: 0, col: 0, value: "ა" },
              { row: 0, col: 1, value: "ბ" },
              { row: 0, col: 2, value: "გ" },
            ],
          });
        return json({ results: [] });
      }),
    );
    renderPlayView();
    await waitFor(() => screen.getByTestId("cell-0-0"));
    await userEvent.click(screen.getByRole("button", { name: "Reveal puzzle" }));
    await waitFor(() => {
      expect(screen.getByTestId("cell-0-0")).toHaveTextContent("ა");
      expect(screen.getByTestId("cell-0-2")).toHaveTextContent("გ");
      expect(screen.getByTestId("cell-0-2")).toHaveAttribute("data-status", "revealed");
    });
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
    await userEvent.click(screen.getByRole("button", { name: /1A/ }));
    await userEvent.keyboard("ააა"); // fills all three cells
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    const saved = JSON.parse(localStorage.getItem("zigzagi:progress:2026-06-18") ?? "{}");
    expect(saved.completedAt).not.toBeNull();
  });
});
