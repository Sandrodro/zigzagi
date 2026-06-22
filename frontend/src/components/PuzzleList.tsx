import { usePuzzleList } from "../api/play";

export function PuzzleList() {
  const { data: puzzles } = usePuzzleList();

  if (!puzzles) return <p>იტვირთება…</p>;
  if (puzzles.length === 0) return <p>გამოქვეყნებული კროსვორდი ჯერ არ არის.</p>;

  return (
    <div style={{ maxWidth: 640, margin: "2rem auto" }}>
      <h1>კროსვორდები</h1>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {puzzles.map((p) => (
          <li key={p.date} style={{ padding: "0.5rem 0", borderBottom: "1px solid #eee" }}>
            <a href={`/play?date=${p.date}`} style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{p.theme}</span>
              <span style={{ color: "#888" }}>{p.date}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
