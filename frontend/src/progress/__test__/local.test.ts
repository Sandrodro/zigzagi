import { afterEach, describe, expect, it } from "vitest";

import { getClientId, loadProgress, saveProgress } from "../local";

afterEach(() => localStorage.clear());

describe("progress/local", () => {
  it("round-trips progress per date", () => {
    expect(loadProgress("2026-06-22")).toBeNull();
    const state = { fills: { "0,0": "ა" }, timerSeconds: 12, completedAt: null };
    saveProgress("2026-06-22", state);
    expect(loadProgress("2026-06-22")).toEqual(state);
    // A different date is independent.
    expect(loadProgress("2026-06-23")).toBeNull();
  });

  it("getClientId is stable across calls", () => {
    const a = getClientId();
    const b = getClientId();
    expect(a).toBe(b);
    expect(a).toHaveLength(36); // uuid
  });

  it("returns null on corrupt data instead of throwing", () => {
    localStorage.setItem("zigzagi:progress:2026-06-22", "{not json");
    expect(loadProgress("2026-06-22")).toBeNull();
  });
});
