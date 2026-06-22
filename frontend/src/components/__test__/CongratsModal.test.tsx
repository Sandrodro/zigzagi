import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CongratsModal } from "../CongratsModal";

describe("CongratsModal", () => {
  it("shows the final time and closes", async () => {
    const onClose = vi.fn();
    render(<CongratsModal seconds={125} onClose={onClose} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("02:05")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /დახურვა/ }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
