import { render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { router } from "../../router";

afterEach(() => vi.unstubAllGlobals());

describe("LIST / PuzzleListAdmin", () => {
  it("lists puzzles with status and a detail link", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => [
        { id: "p1", theme: "ალფა", live_date: "2026-07-02", status: "draft", entry_count: 30 },
        { id: "p2", theme: "ბეტა", live_date: "2026-07-01", status: "published", entry_count: 28 },
      ],
    } as Response)));
    const history = createMemoryHistory({ initialEntries: ["/admin"] });
    router.update({ history });
    render(<RouterProvider router={router} />);
    expect(await screen.findByText("ალფა")).toBeInTheDocument();
    expect(screen.getByText("published")).toBeInTheDocument();
    const link = screen.getAllByRole("link").find((a) => a.getAttribute("href")?.includes("/admin/puzzles/p1"));
    expect(link).toBeTruthy();
  });
});
