import { Link } from "@tanstack/react-router";

import { usePuzzleList } from "../api/play";
import { PageTitle, Muted } from "../components/ui/Typography";

export function PuzzleList() {
  const { data: puzzles, isLoading, isError } = usePuzzleList();
  // Newest-created first — created_at has second-level precision, unlike live_date (day only).
  const sorted = puzzles && [...puzzles].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="mx-auto max-w-[560px] px-5 pt-8 pb-16">
      <PageTitle className="mb-4">ჯვარედინები</PageTitle>
      {isLoading && <Muted>იტვირთება…</Muted>}
      {isError && <Muted>ვერ ჩაიტვირთა.</Muted>}
      {sorted && sorted.length === 0 && <Muted>გამოქვეყნებული ჯვარედინი არ არის.</Muted>}
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {sorted?.map((p) => (
          <li key={p.id}>
            <Link
              to="/play"
              search={{ id: p.id }}
              className="flex items-center justify-between rounded border border-rule px-4 py-3 hover:bg-teal-faint"
            >
              <span className="font-serif font-semibold">ზიგზაგი</span>
              <span className="text-sm text-ink-soft">{p.date}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
