import { useState } from "react";

import { reviewClue, type PuzzleEntry } from "../api/admin";
import { Button } from "./ui/Button";

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
    <table className="data-table">
      <thead>
        <tr>
          <th>პასუხი</th>
          <th>მინიშნება</th>
          <th>სტატუსი</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((e) => (
          <tr key={e.id}>
            <td>{e.answer}</td>
            <td>
              {e.id in editing ? (
                <input
                  className="input"
                  aria-label={`edit ${e.id}`}
                  value={editing[e.id]}
                  onChange={(ev) => setEditing((m) => ({ ...m, [e.id]: ev.target.value }))}
                />
              ) : (
                e.clue
              )}
            </td>
            <td className="muted">{e.clue_status}</td>
            <td>
              {e.id in editing ? (
                <Button variant="primary" size="sm" onClick={() => saveEdit(e.id)}>შენახვა</Button>
              ) : (
                <div className="toolbar" style={{ margin: 0 }}>
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
