import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RunwayDashboard } from "../RunwayDashboard";

const json = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

afterEach(() => vi.unstubAllGlobals());

describe("RunwayDashboard", () => {
  it("shows a warning banner when runway is short", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ runway_days: 3, warning: true })));
    render(<RunwayDashboard />);
    expect(await screen.findByText(/3 დღე/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("shows no warning when runway is healthy", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ runway_days: 10, warning: false })));
    render(<RunwayDashboard />);
    expect(await screen.findByText(/10 დღე/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
