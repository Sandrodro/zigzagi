import { Link, Outlet } from "@tanstack/react-router";

import { PageHeader } from "../components/ui/PageHeader";

const NAV: { to: string; label: string }[] = [
  { to: "/admin", label: "სია" },        // LIST
  { to: "/admin/create", label: "შექმნა" }, // CREATE
  { to: "/admin/wordpool", label: "პული" }, // WORDPOOL
];

export function AdminApp() {
  return (
    <div className="mx-auto max-w-[760px] px-5 pt-8 pb-16">
      <PageHeader title="რედაქცია" eyebrow="ადმინისტრირება" />
      <nav className="mb-6 flex gap-1 border-b border-rule">
        {NAV.map((n) => (
          <Link
            key={n.to}
            to={n.to}
            activeOptions={{ exact: n.to === "/admin" }}
            className="cursor-pointer border-0 border-b-2 border-transparent px-3 py-2 text-sm text-ink-soft hover:text-ink [&.active]:border-b-ochre [&.active]:text-ink"
          >
            {n.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
