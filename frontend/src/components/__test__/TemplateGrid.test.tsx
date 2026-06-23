import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TemplateGrid } from "../TemplateGrid";

describe("TemplateGrid", () => {
  it("renders one playable cell per non-block square", () => {
    render(<TemplateGrid rows={2} cols={2} blocks={[[0, 0]]} />);
    // 4 squares total, 1 is a block → 3 playable cells (testid only on playable)
    expect(screen.queryByTestId("tcell-0-0")).not.toBeInTheDocument();
    expect(screen.getByTestId("tcell-0-1")).toBeInTheDocument();
    expect(screen.getByTestId("tcell-1-0")).toBeInTheDocument();
    expect(screen.getByTestId("tcell-1-1")).toBeInTheDocument();
  });

  it("draws fill letters in the correct cell", () => {
    render(<TemplateGrid rows={2} cols={2} blocks={[[0, 0]]} fills={{ "1,1": "ა" }} />);
    expect(screen.getByTestId("tcell-1-1")).toHaveTextContent("ა");
  });
});
