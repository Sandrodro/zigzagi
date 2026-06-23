import { useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useReducer, useState } from "react";
import { Button } from "../components/ui/Button";
import { SectionTitle } from "../components/ui/Typography";
import { Grid } from "../components/Grid";
import { CrosswordEngine } from "../engine/crossword";
import { answerFills, puzzleDetailToPuzzleData } from "../engine/puzzleData";
import {
  checkEntry, checkPuzzleWords, fetchPuzzle, schedulePuzzle, type PuzzleDetail as Detail,
} from "../api/admin";

export function PuzzleDetail() {
  const { puzzleId } = useParams({ from: "/admin/puzzles/$puzzleId" });
  const [detail, setDetail] = useState<Detail | null>(null);
  const [pubStatus, setPubStatus] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({}); // entryId -> message
  const [busy, setBusy] = useState(false);
  // ponytail: mutable engine; counter forces a re-render after each mutation.
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  // Rebuild the read-only finished-crossword engine whenever the detail changes.
  const engine = useMemo(() => {
    if (!detail) return null;
    const data = puzzleDetailToPuzzleData(detail);
    if (!data) return null;
    const e = new CrosswordEngine(data);
    e.loadFills(answerFills(detail.entries));
    return e;
  }, [detail]);

  async function load() {
    const d = await fetchPuzzle(puzzleId);
    setDetail(d);
  }
  useEffect(() => { load(); }, [puzzleId]);

  async function publish() {
    setBusy(true);
    try {
      const r = await schedulePuzzle(puzzleId);  // date guard dropped; backend defaults to today
      setPubStatus(r.status);
      await load();
    } finally { setBusy(false); }
  }

  async function checkOne(entryId: string) {
    const r = await checkEntry(puzzleId, entryId);
    setResults((m) => ({ ...m, [entryId]: r.valid ? "✓" : r.replaced_with ? `→ ${r.replaced_with}` : "✗" }));
    await load();
  }

  async function checkAll() {
    setBusy(true);
    try { await checkPuzzleWords(puzzleId); await load(); } finally { setBusy(false); }
  }

  if (!detail) return <p className="text-sm text-ink-soft">…</p>;

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle>{detail.theme}</SectionTitle>
      <p className="text-sm text-ink-soft">სტატუსი: {detail.status}{pubStatus ? ` → ${pubStatus}` : ""}</p>

      <div className="flex items-end gap-2">
        <Button onClick={publish} disabled={busy}>გამოქვეყნება</Button>
        <Button variant="ghost" onClick={checkAll} disabled={busy}>სიტყვების შემოწმება</Button>
      </div>

      {engine && (
        <Grid
          engine={engine}
          onCellClick={(r, c) => { engine.setActive(r, c); rerender(); }}
        />
      )}

      <table className="w-full text-sm">
        <thead><tr className="text-left text-ink-soft">
          <th className="py-1">#</th><th>მიმართ.</th><th>სიტყვა</th><th>შედეგი</th><th />
        </tr></thead>
        <tbody>
          {detail.entries.map((e) => (
            <tr key={e.id} className="border-t border-rule">
              <td className="py-1">{e.number}</td>
              <td>{e.direction}</td>
              <td>{e.answer}</td>
              <td>{results[e.id] ?? ""}</td>
              <td><Button size="sm" variant="ghost" onClick={() => checkOne(e.id)}>შემოწმება</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
