import { useState } from "react";

import { reviewClue, type PuzzleEntry } from "../api/admin";

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
    <table>
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
                  aria-label={`edit ${e.id}`}
                  value={editing[e.id]}
                  onChange={(ev) => setEditing((m) => ({ ...m, [e.id]: ev.target.value }))}
                />
              ) : (
                e.clue
              )}
            </td>
            <td>{e.clue_status}</td>
            <td>
              {e.id in editing ? (
                <button onClick={() => saveEdit(e.id)}>შენახვა</button>
              ) : (
                <>
                  <button onClick={() => accept(e.id)}>მიღება</button>
                  <button onClick={() => setEditing((m) => ({ ...m, [e.id]: e.clue ?? "" }))}>რედაქტირება</button>
                  <button onClick={() => reject(e.id)}>უარყოფა</button>
                </>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
