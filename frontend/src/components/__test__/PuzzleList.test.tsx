import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PuzzleList } from "../PuzzleList";

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

afterEach(() => vi.unstubAllGlobals());

function renderList() {
  const rootRoute = createRootRoute();
  const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: PuzzleList });
  const playRoute = createRoute({ getParentRoute: () => rootRoute, path: "/play", component: () => null });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, playRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("PuzzleList", () => {
  it("lists puzzles with links to play each by date", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        json([
          { date: "2026-06-20", theme: "თბილისი", status: "published" },
          { date: "2026-06-18", theme: "მთები", status: "published" },
        ]),
      ),
    );
    renderList();
    const link = await screen.findByRole("link", { name: /თბილისი/ });
    expect(link).toHaveAttribute("href", "/play?date=2026-06-20");
    expect(screen.getByRole("link", { name: /მთები/ })).toHaveAttribute("href", "/play?date=2026-06-18");
  });

  it("shows an empty state when nothing is published", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json([])));
    renderList();
    await waitFor(() => expect(screen.getByText(/ჯერ არ არის/)).toBeInTheDocument());
  });
});
