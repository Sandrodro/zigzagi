import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTimer } from "../useTimer";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useTimer", () => {
  it("ticks once per second while running and pauses", () => {
    const { result } = renderHook(() => useTimer());
    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(3000));
    expect(result.current.seconds).toBe(3);
    act(() => result.current.pause());
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.seconds).toBe(3);
  });

  it("seeds from the initial (persisted) value", () => {
    const { result } = renderHook(() => useTimer(42));
    expect(result.current.seconds).toBe(42);
  });

  it("reset returns to zero and stops", () => {
    const { result } = renderHook(() => useTimer(10));
    act(() => result.current.start());
    act(() => result.current.reset());
    expect(result.current.seconds).toBe(0);
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.seconds).toBe(0);
  });
});
