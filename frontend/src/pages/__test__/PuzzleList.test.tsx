import { render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { router } from "../../router";

afterEach(() => vi.unstubAllGlobals());

const renderList = () => {
  const history = createMemoryHistory({ initialEntries: ["/list"] });
  router.update({ history });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
};

const idOf = (link: HTMLElement) =>
  new URLSearchParams(link.getAttribute("href")?.split("?")[1]).get("id");

describe("PLAY / PuzzleList", () => {
  it("lists published puzzles newest-created first, linking to /play by id", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => [
        { id: "p1", date: "2026-07-01", status: "published", created_at: "2026-07-01T10:00:00+00:00" },
        { id: "p2", date: "2026-07-02", status: "published", created_at: "2026-07-01T09:00:00+00:00" },
        { id: "p3", date: "2026-07-02", status: "published", created_at: "2026-07-02T12:00:00+00:00" },
      ],
    } as Response)));

    renderList();

    await screen.findByText("2026-07-01");
    const links = screen.getAllByRole("link");
    expect(links.map(idOf)).toEqual(["p3", "p1", "p2"]);
  });

  it("shows a message when there are no published puzzles", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [] } as Response)));

    renderList();

    expect(await screen.findByText("გამოქვეყნებული ჯვარედინი არ არის.")).toBeInTheDocument();
  });

  it("shows an error message when the list fails to load", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) } as Response)));

    renderList();

    expect(await screen.findByText("ვერ ჩაიტვირთა.")).toBeInTheDocument();
  });
});
