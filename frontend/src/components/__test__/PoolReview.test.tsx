import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PoolReview } from "../PoolReview";

const EXTRACTED = {
  dropped_count: 1,
  candidates: [{ id: "1", surface: "თბილისი", lemma: "თბილისი", length: 7, snippet: "s" }],
};

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn((url: string) => {
    if (url.endsWith("/extract")) return json(EXTRACTED);
    if (url.endsWith("/pool/bulk")) return json({ updated: 1 });
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("PoolReview", () => {
  it("extracts, displays candidates, and bulk-accepts selected", async () => {
    render(<PoolReview />);

    await userEvent.type(screen.getByLabelText("theme"), "თბილისი");
    await userEvent.type(screen.getByLabelText("source text"), "ტექსტი");
    await userEvent.click(screen.getByText("ამოღება"));

    expect(await screen.findByText("თბილისი")).toBeInTheDocument();
    expect(screen.getByText("ამოვარდა: 1")).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("select-1"));
    await userEvent.click(screen.getByText("მონიშნულის მიღება"));

    await waitFor(() => {
      const bulkCall = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/pool/bulk"));
      expect(bulkCall).toBeTruthy();
      expect(JSON.parse((bulkCall![1] as RequestInit).body as string)).toEqual({
        ops: [{ id: "1", action: "accept" }],
      });
    });
  });
});
