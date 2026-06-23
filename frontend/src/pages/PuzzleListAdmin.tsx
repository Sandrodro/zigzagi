import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { listPuzzles, type PuzzleSummary } from "../api/admin";
import { SectionTitle } from "../components/ui/Typography";

export function PuzzleListAdmin() {
  const [rows, setRows] = useState<PuzzleSummary[]>([]);
  useEffect(() => { listPuzzles().then(setRows).catch(() => setRows([])); }, []);
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
              <td>
                <Link to="/admin/puzzles/$puzzleId" params={{ puzzleId: p.id }} className="text-ochre underline">
                  გახსნა
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
