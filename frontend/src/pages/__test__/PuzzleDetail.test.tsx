import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { router } from "../../router";

afterEach(() => vi.unstubAllGlobals());

const DETAIL = {
  id: "p1", theme: "ალფა", live_date: "2026-07-02", status: "draft",
  grid_template: { rows: 1, cols: 4, blocks: [], cells: [{ row: 0, col: 0, number: 1 }] },
  entries: [{ id: "e1", number: 1, direction: "across", answer: "დედა", row: 0, col: 0, clue: null, clue_status: "pending", provenance: "manual" }],
};

describe("DETAIL / PuzzleDetail", () => {
  it("checks a single entry word via AI", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/entries/") && url.includes("/check"))
        return { ok: true, json: async () => ({ valid: false, replaced_with: "დილა" }) } as Response;
      return { ok: true, json: async () => DETAIL } as Response;
    }));
    const history = createMemoryHistory({ initialEntries: ["/admin/puzzles/p1"] });
    router.update({ history });
    render(<RouterProvider router={router} />);
    await userEvent.click(await screen.findByRole("button", { name: "შემოწმება" }));
    expect(await screen.findByText(/დილა/)).toBeInTheDocument();
  });

  it("publishes (schedules) the puzzle", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes("/schedule")) return { ok: true, json: async () => ({ status: "scheduled", live_date: "2026-07-02" }) } as Response;
      return { ok: true, json: async () => DETAIL } as Response;
    }));
    const history = createMemoryHistory({ initialEntries: ["/admin/puzzles/p1"] });
    router.update({ history });
    render(<RouterProvider router={router} />);
    await screen.findByRole("button", { name: "გამოქვეყნება" });
    // The finished crossword renders with the answer letters in its cells.
    expect((await screen.findByRole("grid")).textContent).toContain("დ");
    await userEvent.click(screen.getByRole("button", { name: "გამოქვეყნება" }));
    await waitFor(() => expect(calls.some((u) => u.includes("/schedule"))).toBe(true));
    expect(await screen.findByText(/scheduled/)).toBeInTheDocument();
  });
});
