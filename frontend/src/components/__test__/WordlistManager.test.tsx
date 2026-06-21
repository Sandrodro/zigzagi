import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WordlistManager } from "../WordlistManager";

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/wordlist/stats")) return json({ active: 1, blocked: 0, by_length: { "3": 1 } });
    if (u.endsWith("/wordlist/bulk")) return json({ added: 2, rejected: [] });
    if (u.includes("/wordlist") && init?.method === "POST") return json({ id: "1", word: "აბგ", length: 3, status: "active" });
    if (u.includes("/wordlist/") && init?.method === "PATCH") return json({ id: "1", word: "აბგ", length: 3, status: "blocked" });
    if (u.includes("/wordlist")) return json([{ id: "1", word: "აბგ", length: 3, status: "active" }]);
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("WordlistManager", () => {
  it("lists words and shows the length histogram on mount", async () => {
    render(<WordlistManager />);
    expect(await screen.findByText("აბგ")).toBeInTheDocument();
    expect(screen.getByText(/აქტიური: 1/)).toBeInTheDocument();
  });

  it("blocks the selected word", async () => {
    render(<WordlistManager />);
    await screen.findByText("აბგ");
    await userEvent.click(screen.getByTestId("select-1"));
    await userEvent.click(screen.getByText("დაბლოკვა"));
    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(
        ([u, i]) => String(u).includes("/wordlist/1") && (i as RequestInit)?.method === "PATCH",
      );
      expect(patch).toBeTruthy();
      expect(JSON.parse((patch![1] as RequestInit).body as string)).toEqual({ status: "blocked" });
    });
  });

  it("bulk-imports pasted text", async () => {
    render(<WordlistManager />);
    await screen.findByText("აბგ");
    await userEvent.type(screen.getByLabelText("bulk import"), "თბილისი ბათუმი");
    await userEvent.click(screen.getByText("იმპორტი"));
    await waitFor(() => expect(screen.getByText(/დაემატა: 2/)).toBeInTheDocument());
  });
});
