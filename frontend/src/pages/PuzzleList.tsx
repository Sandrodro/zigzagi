import { Link } from "@tanstack/react-router";

import { usePuzzleList } from "../api/play";
import { PageHeader } from "../components/ui/PageHeader";

export function PuzzleList() {
  const { data: puzzles } = usePuzzleList();

  if (!puzzles) return <p className="mx-auto max-w-[760px] px-5 pt-8 text-ink-soft">იტვირთება…</p>;

  return (
    <div className="mx-auto max-w-[760px] px-5 pt-8 pb-16">
      <PageHeader title="არქივი" eyebrow="გამოქვეყნებული კროსვორდები" />

      {puzzles.length === 0 ? (
        <p className="text-ink-soft">გამოქვეყნებული კროსვორდი ჯერ არ არის.</p>
      ) : (
        <ul className="mt-6 list-none p-0">
          {puzzles.map((p) => (
            <li key={p.id} className="border-b border-rule">
              <Link
                to="/play"
                search={{ id: p.id }}
                className="flex items-baseline justify-between gap-4 px-1 py-2.5 text-ink hover:bg-teal-faint hover:no-underline"
              >
                <span className="font-serif text-[1.05rem]">{p.theme}</span>
                <span className="font-mono text-[0.8rem] text-ink-soft">{p.date}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
