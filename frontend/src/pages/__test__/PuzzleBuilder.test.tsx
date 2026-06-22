import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PuzzleBuilder } from "../PuzzleBuilder";

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/puzzles") && init?.method === "POST")
      return json({ id: "p1", theme: "თბილისი", live_date: "2026-07-10", status: "draft" });
    if (u.endsWith("/fill")) return json({ job_id: "j1" });
    if (u.includes("/jobs/")) return json({ status: "done", result: { entries: 1 }, error: null });
    if (u.endsWith("/puzzles/p1"))
      return json({
        id: "p1", theme: "თბილისი", live_date: "2026-07-10", status: "draft", grid_template: {},
        entries: [{ id: "e1", number: 1, direction: "across", answer: "თბილისი", row: 0, col: 0, clue: null, clue_status: "pending", provenance: "sourced" }],
      });
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("PuzzleBuilder", () => {
  it("creates a draft, fills it, and shows the filled entries", async () => {
    render(<PuzzleBuilder />);

    await userEvent.type(screen.getByLabelText("theme"), "თბილისი");
    await userEvent.type(screen.getByLabelText("live date"), "2026-07-10");
    await userEvent.click(screen.getByText("შექმნა"));

    expect(await screen.findByText(/p1/)).toBeInTheDocument();

    await userEvent.click(screen.getByText("შევსება"));
    await userEvent.click(screen.getByText("სტატუსის შემოწმება"));

    expect(await screen.findByText("თბილისი")).toBeInTheDocument();
    expect(screen.getByText(/done/)).toBeInTheDocument();
  });

  it("shows the failure reason when the fill fails", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/puzzles") && init?.method === "POST")
        return json({ id: "p1", theme: "თ", live_date: "2026-07-10", status: "draft" });
      if (u.endsWith("/fill")) return json({ job_id: "j1" });
      if (u.includes("/jobs/")) return json({ status: "failed", result: null, error: "not enough seeds" });
      return json({});
    });
    render(<PuzzleBuilder />);
    await userEvent.type(screen.getByLabelText("theme"), "თ");
    await userEvent.type(screen.getByLabelText("live date"), "2026-07-10");
    await userEvent.click(screen.getByText("შექმნა"));
    await screen.findByText(/p1/);
    await userEvent.click(screen.getByText("შევსება"));
    await userEvent.click(screen.getByText("სტატუსის შემოწმება"));
    await waitFor(() => expect(screen.getByText(/not enough seeds/)).toBeInTheDocument());
  });
});
