import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { deletePuzzle, listPuzzles, type PuzzleSummary } from "../api/admin";
import { Button } from "../components/ui/Button";
import { SectionTitle } from "../components/ui/Typography";

export function PuzzleListAdmin() {
  const [rows, setRows] = useState<PuzzleSummary[]>([]);
  useEffect(() => { listPuzzles().then(setRows).catch(() => setRows([])); }, []);

  async function handleDelete(id: string) {
    if (!window.confirm("წავშალო ეს ჯვარედინი?")) return;
    await deletePuzzle(id);
    setRows((prev) => prev.filter((r) => r.id !== id));
  }
  return (
    <div className="flex flex-col gap-3">
      <SectionTitle>ჯვარედინები</SectionTitle>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-ink-soft">
          <th className="py-1">თემა</th><th>თარიღი</th><th>სტატუსი</th><th>სიტყვები</th><th />
        </tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-t border-rule">
              <td className="py-1">{p.theme}</td>
              <td>{p.live_date}</td>
              <td>{p.status}</td>
              <td>{p.entry_count}</td>
              <td className="flex items-center gap-3 py-1">
                <Link to="/admin/puzzles/$puzzleId" params={{ puzzleId: p.id }} className="text-ochre underline">
                  გახსნა
                </Link>
                <Button variant="danger" size="sm" onClick={() => handleDelete(p.id)}>
                  წაშლა
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
