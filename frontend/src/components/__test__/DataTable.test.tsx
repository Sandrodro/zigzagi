import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DataTable } from "../DataTable";

const COLUMNS = [
  { key: "surface", header: "Word" },
  { key: "length", header: "Len" },
] as const;
const ROWS = [
  { id: "1", surface: "თბილისი", length: 7 },
  { id: "2", surface: "ბათუმი", length: 6 },
];

describe("DataTable", () => {
  it("renders headers and rows", () => {
    render(<DataTable columns={[...COLUMNS]} rows={ROWS} />);
    expect(screen.getByText("Word")).toBeInTheDocument();
    expect(screen.getByText("თბილისი")).toBeInTheDocument();
  });

  it("emits selected row ids", async () => {
    const onSel = vi.fn();
    render(<DataTable columns={[...COLUMNS]} rows={ROWS} selectable onSelectionChange={onSel} />);
    await userEvent.click(screen.getByTestId("select-1"));
    expect(onSel).toHaveBeenCalledWith(["1"]);
  });
});
