import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter, createRootRoute, createRoute, createMemoryHistory } from "@tanstack/react-router";
import { vi, expect, test, beforeEach } from "vitest";
import { PuzzleBuilder } from "../PuzzleBuilder";

function renderWithProviders() {
  const root = createRootRoute();
  const idx = createRoute({ getParentRoute: () => root, path: "/", component: PuzzleBuilder });
  const router = createRouter({
    routeTree: root.addChildren([idx]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/templates")) return new Response(JSON.stringify([]));
    if (url.endsWith("/puzzles") && init?.method === "POST")
      return new Response(JSON.stringify({ id: "p1", theme: "t", live_date: "2026-07-01", status: "draft" }));
    if (url.includes("/fill")) {
      const body = JSON.parse(init!.body as string);
      (globalThis as any).__fillBody = body;
      return new Response(JSON.stringify({ job_id: "j1" }), { status: 202 });
    }
    if (url.includes("/jobs/")) return new Response(JSON.stringify({ status: "done", result: null, error: null }));
    if (url.includes("/puzzles/p1")) return new Response(JSON.stringify({ id: "p1", theme: "t", status: "draft", grid_template: {}, entries: [] }));
    return new Response("{}");
  }));
});

test("freeform button posts mode=freeform", async () => {
  renderWithProviders();
  fireEvent.click(await screen.findByText("თავისუფალი ფორმა"));
  await waitFor(() => expect((globalThis as any).__fillBody?.mode).toBe("freeform"));
});
