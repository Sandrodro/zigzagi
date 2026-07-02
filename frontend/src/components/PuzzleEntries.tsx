import { useMemo, useReducer, useState } from "react";
import { Button } from "./ui/Button";
import { Grid } from "./Grid";
import { CrosswordEngine } from "../engine/crossword";
import { answerFills, puzzleDetailToPuzzleData } from "../engine/puzzleData";
import {
  autoClue, blockEntryWord, checkEntry, deleteEntry, swapEntry, type PuzzleDetail,
} from "../api/admin";

// Finished-crossword view: filled grid + per-entry check / swap / delete actions.
// Shared by the LIST detail page and the CREATE flow.
export function PuzzleEntries({ detail, reload }: { detail: PuzzleDetail; reload: () => void | Promise<void> }) {
  const [results, setResults] = useState<Record<string, string>>({}); // entryId -> message
  const [cluesBusy, setCluesBusy] = useState(false);
  // ponytail: mutable engine; counter forces a re-render after each mutation.
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const engine = useMemo(() => {
    const data = puzzleDetailToPuzzleData(detail);
    if (!data) return null;
    const e = new CrosswordEngine(data);
    e.loadFills(answerFills(detail.entries));
    return e;
  }, [detail]);

  async function checkOne(entryId: string) {
    const r = await checkEntry(detail.id, entryId);
    setResults((m) => ({ ...m, [entryId]: r.valid ? "✓" : r.replaced_with ? `→ ${r.replaced_with}` : "✗" }));
    await reload();
  }

  async function swapOne(entryId: string) {
    const r = await swapEntry(detail.id, entryId);
    setResults((m) => ({ ...m, [entryId]: r.replaced ? `→ ${r.word}` : "ვერ მოიძებნა" }));
    await reload();
  }

  async function removeFromDb(entryId: string) {
    const r = await blockEntryWord(detail.id, entryId);
    setResults((m) => ({ ...m, [entryId]: r.replaced ? `→ ${r.word}` : "ვერ მოიძებნა" }));
    await reload();
  }

  async function removeFromGrid(entryId: string) {
    await deleteEntry(detail.id, entryId);
    await reload();
  }

  async function generateClues() {
    setCluesBusy(true);
    try { await autoClue(detail.id); await reload(); } finally { setCluesBusy(false); }
  }

  return (
    <>
      {engine && (
        <Grid engine={engine} onCellClick={(r, c) => { engine.setActive(r, c); rerender(); }} />
      )}

      <div>
        <Button variant="ghost" onClick={generateClues} disabled={cluesBusy}>
          მინიშნებების გენერაცია
        </Button>
      </div>

      <table className="w-full text-sm">
        <thead><tr className="text-left text-ink-soft">
          <th className="py-1">#</th><th>მიმართ.</th><th>სიტყვა</th><th>შედეგი</th><th />
        </tr></thead>
        <tbody>
          {detail.entries.map((e) => (
            <tr key={e.id} className="border-t border-rule align-top">
              <td className="py-1">{e.number}</td>
              <td>{e.direction}</td>
              <td>
                <div>{e.answer}</div>
                {e.clue && <div className="text-xs text-ink-soft">{e.clue}</div>}
              </td>
              <td>{results[e.id] ?? ""}</td>
              <td className="flex flex-wrap gap-1 py-1">
                <Button size="sm" variant="ghost" onClick={() => checkOne(e.id)}>შემოწმება</Button>
                <Button size="sm" variant="ghost" onClick={() => swapOne(e.id)}>სხვა სიტყვა</Button>
                <Button size="sm" variant="danger" onClick={() => removeFromDb(e.id)}>ბაზიდან წაშლა</Button>
                <Button size="sm" variant="danger" onClick={() => removeFromGrid(e.id)}>ამოღება</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
