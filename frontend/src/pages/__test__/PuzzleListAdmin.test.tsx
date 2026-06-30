import { fireEvent, render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { router } from "../../router";

afterEach(() => vi.unstubAllGlobals());

describe("LIST / PuzzleListAdmin", () => {
  it("lists puzzles with status and a detail link", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => [
        { id: "p1", live_date: "2026-07-02", status: "draft", entry_count: 30 },
        { id: "p2", live_date: "2026-07-01", status: "published", entry_count: 28 },
      ],
    } as Response)));
    const history = createMemoryHistory({ initialEntries: ["/admin"] });
    router.update({ history });
    render(<RouterProvider router={router} />);
    expect(await screen.findByText("2026-07-02")).toBeInTheDocument();
    expect(screen.getByText("published")).toBeInTheDocument();
    const link = screen.getAllByRole("link").find((a) => a.getAttribute("href")?.includes("/admin/puzzles/p1"));
    expect(link).toBeTruthy();
  });

  it("deletes a puzzle when its delete button is clicked", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [
        { id: "p1", live_date: "2026-07-02", status: "draft", entry_count: 30 },
      ],
    } as Response));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("confirm", () => true);
    const history = createMemoryHistory({ initialEntries: ["/admin"] });
    router.update({ history });
    render(<RouterProvider router={router} />);
    await screen.findByText("2026-07-02");
    const delBtn = screen.getByText("წაშლა");
    fireEvent.click(delBtn);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/puzzles/p1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
