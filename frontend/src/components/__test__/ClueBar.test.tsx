import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ClueBar } from "../ClueBar";

const clue = { number: 4, cell: [1, 0] as [number, number], length: 2, text: "ქალაქი" };
const noop = () => {};

describe("ClueBar", () => {
  it("shows the clue text", () => {
    render(<ClueBar clue={clue} direction="across" onPrev={noop} onNext={noop} onToggleDirection={noop} />);
    expect(screen.getByText(/ქალაქი/)).toBeInTheDocument();
  });

  it("renders empty safely when there is no clue", () => {
    render(<ClueBar clue={null} direction="across" onPrev={noop} onNext={noop} onToggleDirection={noop} />);
    expect(screen.getByRole("group")).toBeInTheDocument();
  });
});
