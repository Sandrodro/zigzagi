import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ClueList } from "../ClueList";

const across = [
  { number: 1, cell: [0, 0] as [number, number], length: 3, text: "1A" },
  { number: 4, cell: [1, 0] as [number, number], length: 2, text: "4A" },
];
const down = [{ number: 2, cell: [0, 1] as [number, number], length: 3, text: "2D" }];

describe("ClueList", () => {
  it("highlights the active clue by number and direction", () => {
    render(
      <ClueList across={across} down={down} activeNumber={4} activeDirection="across" onSelect={() => {}} />,
    );
    const activeBtn = screen.getByRole("button", { name: /4A/ });
    expect(activeBtn).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("button", { name: /1A/ })).toHaveAttribute("data-active", "false");
  });

  it("calls onSelect with the clue number and direction", async () => {
    const onSelect = vi.fn();
    render(
      <ClueList across={across} down={down} activeNumber={1} activeDirection="across" onSelect={onSelect} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /2D/ }));
    expect(onSelect).toHaveBeenCalledWith(2, "down");
  });
});
