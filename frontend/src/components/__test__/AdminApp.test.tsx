import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminApp } from "../AdminApp";

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

beforeEach(() => {
  // The child screens fetch on mount; return empty/benign payloads.
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const u = String(url);
      if (u.endsWith("/wordlist/stats")) return json({ active: 0, blocked: 0, by_length: {} });
      if (u.includes("/wordlist")) return json([]);
      return json([]);
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("AdminApp", () => {
  it("defaults to the pool tab and switches to wordlist", async () => {
    render(<AdminApp />);
    // Pool screen renders its extract button.
    expect(screen.getByText("ამოღება")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "ლექსიკონი" }));
    expect(await screen.findByText("ლექსიკონი", { selector: "h2" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "აწყობა" }));
    expect(screen.getByText("ფაზლის აწყობა")).toBeInTheDocument();
  });
});
