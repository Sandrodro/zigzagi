import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WordPool } from "../WordPool";

afterEach(() => vi.unstubAllGlobals());

describe("WORDPOOL / WordPool", () => {
  it("adds a word to the pool", async () => {
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: String(init?.body ?? "") });
      return { ok: true, json: async () => ({ id: "c1", surface: "დედამიწა", length: 8, status: "accepted" }) } as Response;
    }));
    render(<WordPool />);
    await userEvent.type(screen.getByLabelText("ახალი სიტყვა"), "დედამიწა");
    await userEvent.type(screen.getByLabelText("თემა (პული)"), "გეო");
    await userEvent.click(screen.getByRole("button", { name: "დამატება" }));
    expect(calls.some((c) => c.url.includes("/api/admin/pool") && c.body.includes("დედამიწა"))).toBe(true);
  });
});
