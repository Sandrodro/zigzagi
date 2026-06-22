import { Link } from "@tanstack/react-router";

import { usePuzzleList } from "../api/play";
import { PageHeader } from "../components/ui/PageHeader";

export function PuzzleList() {
  const { data: puzzles } = usePuzzleList();

  if (!puzzles) return <p className="page muted">იტვირთება…</p>;

  return (
    <div className="page">
      <PageHeader title="არქივი" eyebrow="გამოქვეყნებული კროსვორდები" />

      {puzzles.length === 0 ? (
        <p className="muted">გამოქვეყნებული კროსვორდი ჯერ არ არის.</p>
      ) : (
        <ul className="archive">
          {puzzles.map((p) => (
            <li key={p.date} className="archive__row">
              <Link to="/play" search={{ date: p.date }} className="archive__link">
                <span className="archive__theme">{p.theme}</span>
                <span className="archive__date">{p.date}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
