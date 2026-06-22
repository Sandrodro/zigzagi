import { useState } from "react";

import { reviewClue, type PuzzleEntry } from "../api/admin";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";

const TH = "border-b border-rule-strong px-2 py-1.5 text-left text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-soft";
const TD = "border-b border-rule px-2 py-1.5";

// ponytail: own table, not <DataTable> — its cells are String()-only and can't host per-row buttons/inputs.
export function ClueReview({ puzzleId, entries }: { puzzleId: string; entries: PuzzleEntry[] }) {
  const [rows, setRows] = useState<PuzzleEntry[]>(entries);
  const [editing, setEditing] = useState<Record<string, string>>({});

  const setStatus = (id: string, clue_status: string, clue?: string) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, clue_status, clue: clue ?? r.clue } : r)));

  const accept = async (id: string) => {
    const { clue_status } = await reviewClue(puzzleId, id, "accept");
    setStatus(id, clue_status);
  };

  const reject = async (id: string) => {
    const { clue_status } = await reviewClue(puzzleId, id, "reject");
    setStatus(id, clue_status);
  };

  const saveEdit = async (id: string) => {
    const clue = editing[id];
    const { clue_status } = await reviewClue(puzzleId, id, "edit", clue);
    setStatus(id, clue_status, clue);
    setEditing(({ [id]: _, ...rest }) => rest);
  };

  return (
    <table className="mt-4 w-full border-collapse text-[0.88rem]">
      <thead>
        <tr>
          <th className={TH}>პასუხი</th>
          <th className={TH}>მინიშნება</th>
          <th className={TH}>სტატუსი</th>
          <th className={TH} />
        </tr>
      </thead>
      <tbody>
        {rows.map((e) => (
          <tr key={e.id} className="hover:bg-teal-faint">
            <td className={TD}>{e.answer}</td>
            <td className={TD}>
              {e.id in editing ? (
                <Input
                  aria-label={`edit ${e.id}`}
                  value={editing[e.id]}
                  onChange={(ev) => setEditing((m) => ({ ...m, [e.id]: ev.target.value }))}
                />
              ) : (
                e.clue
              )}
            </td>
            <td className={`${TD} text-ink-soft`}>{e.clue_status}</td>
            <td className={TD}>
              {e.id in editing ? (
                <Button variant="primary" size="sm" onClick={() => saveEdit(e.id)}>შენახვა</Button>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" size="sm" onClick={() => accept(e.id)}>მიღება</Button>
                  <Button size="sm" onClick={() => setEditing((m) => ({ ...m, [e.id]: e.clue ?? "" }))}>რედაქტირება</Button>
                  <Button variant="danger" size="sm" onClick={() => reject(e.id)}>უარყოფა</Button>
                </div>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
