import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClueReview } from "../ClueReview";
import type { PuzzleEntry } from "../../api/admin";

const entry = (id: string, answer: string): PuzzleEntry => ({
  id,
  number: 1,
  direction: "across",
  answer,
  row: 0,
  col: 0,
  clue: "მინიშნება",
  clue_status: "generated",
  provenance: "sourced",
});

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(() =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ clue_status: "accepted" }) } as Response),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("ClueReview", () => {
  it("accepts a clue and updates the row status", async () => {
    render(<ClueReview puzzleId="p1" entries={[entry("e1", "თბილისი"), entry("e2", "მთა")]} />);

    const row = screen.getByText("თბილისი").closest("tr")!;
    await userEvent.click(within(row).getByRole("button", { name: "მიღება" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/puzzles/p1/clues/e1",
      expect.objectContaining({ method: "PATCH" }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.action).toBe("accept");
    expect(within(row).getByText("accepted")).toBeInTheDocument();
  });
});
