import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ClueBar } from "../ClueBar";

const clue = { number: 4, cell: [1, 0] as [number, number], length: 2, text: "ქალაქი" };

describe("ClueBar", () => {
  it("shows the clue number and text and wires the buttons", async () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    const onToggle = vi.fn();
    render(
      <ClueBar clue={clue} direction="across" onPrev={onPrev} onNext={onNext} onToggleDirection={onToggle} />,
    );
    expect(screen.getByText(/ქალაქი/)).toBeInTheDocument();
    expect(screen.getByText(/4/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "previous clue" }));
    await userEvent.click(screen.getByRole("button", { name: "next clue" }));
    await userEvent.click(screen.getByRole("button", { name: "toggle direction" }));
    expect(onPrev).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("renders empty safely when there is no clue", () => {
    render(
      <ClueBar clue={null} direction="across" onPrev={() => {}} onNext={() => {}} onToggleDirection={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "next clue" })).toBeInTheDocument();
  });
});
