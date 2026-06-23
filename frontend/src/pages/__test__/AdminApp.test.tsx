import { render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { router } from "../../router";

describe("AdminApp shell", () => {
  it("renders the three nav links at /admin", async () => {
    const history = createMemoryHistory({ initialEntries: ["/admin"] });
    router.update({ history });
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole("link", { name: "სია" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "შექმნა" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "პული" })).toBeInTheDocument();
  });
});
