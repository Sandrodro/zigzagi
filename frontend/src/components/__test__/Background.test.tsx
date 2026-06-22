import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Background } from "../Background";

const setReducedMotion = (matches: boolean) =>
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );

afterEach(() => vi.unstubAllGlobals());

describe("Background", () => {
  beforeEach(() => setReducedMotion(false));

  it("falls back to a CSS gradient when WebGL is unavailable", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    render(<Background enabled />);
    expect(screen.getByTestId("bg-gradient")).toBeInTheDocument();
    expect(screen.queryByTestId("bg-canvas")).not.toBeInTheDocument();
  });

  it("renders the static gradient (no canvas) under reduced motion", () => {
    setReducedMotion(true);
    render(<Background enabled />);
    expect(screen.getByTestId("bg-gradient")).toBeInTheDocument();
    expect(screen.queryByTestId("bg-canvas")).not.toBeInTheDocument();
  });

  it("renders the static gradient when disabled by the toggle", () => {
    render(<Background enabled={false} />);
    expect(screen.getByTestId("bg-gradient")).toBeInTheDocument();
  });
});
