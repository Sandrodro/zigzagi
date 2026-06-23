import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { router } from "../../router";

function mockFetch(handlers: Record<string, (init?: RequestInit) => unknown>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const key = Object.keys(handlers).find((k) => url.includes(k));
    if (!key) throw new Error(`unmocked ${url}`);
    return { ok: true, json: async () => handlers[key](init) } as Response;
  }));
}

afterEach(() => vi.unstubAllGlobals());

const TEMPLATE = {
  id: "11x11-001", rows: 11, cols: 11, blocks: [],
  slots: [{ number: 1, direction: "across", row: 0, col: 0, length: 4 }],
};

describe("CREATE / PuzzleBuilder", () => {
  it("picks a template, types a slot word, generates, shows view link", async () => {
    mockFetch({
      "/api/admin/templates": () => [TEMPLATE],
      "/api/admin/puzzles/": () => ({ // fetchPuzzle detail
        id: "p1", theme: "t", live_date: "2026-07-01", status: "draft", grid_template: {},
        entries: [{ id: "e1", number: 1, direction: "across", answer: "დედა", row: 0, col: 0, clue: null, clue_status: "pending", provenance: "manual" }],
      }),
      "/api/admin/puzzles": () => ({ id: "p1", theme: "t", live_date: "2026-07-01", status: "draft" }), // createPuzzle
      "/fill": () => ({ job_id: "j1" }),
      "/api/admin/jobs/": () => ({ status: "done", result: { entries: 1 }, error: null }),
    });

    const history = createMemoryHistory({ initialEntries: ["/admin/create"] });
    router.update({ history });
    render(<RouterProvider router={router} />);

    const select = await screen.findByLabelText("შაბლონი");
    await userEvent.selectOptions(select, "11x11-001");
    const slotInput = await screen.findByLabelText("1 across");
    await userEvent.type(slotInput, "დედა");
    await userEvent.type(screen.getByLabelText("თემა"), "ტესტი");
    await userEvent.type(screen.getByLabelText("თარიღი"), "2026-07-01");
    await userEvent.click(screen.getByRole("button", { name: "გენერაცია" }));

    expect(await screen.findByText("დედა")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /სიაში ნახვა/ })).toBeInTheDocument();
  });
});
