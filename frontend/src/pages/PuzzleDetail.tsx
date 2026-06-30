import { useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { SectionTitle } from "../components/ui/Typography";
import { PuzzleEntries } from "../components/PuzzleEntries";
import {
  checkPuzzleWords, fetchPuzzle, schedulePuzzle, type PuzzleDetail as Detail,
} from "../api/admin";

export function PuzzleDetail() {
  const { puzzleId } = useParams({ from: "/admin/puzzles/$puzzleId" });
  const [detail, setDetail] = useState<Detail | null>(null);
  const [pubStatus, setPubStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setDetail(await fetchPuzzle(puzzleId));
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

  async function checkAll() {
    setBusy(true);
    try { await checkPuzzleWords(puzzleId); await load(); } finally { setBusy(false); }
  }

  if (!detail) return <p className="text-sm text-ink-soft">…</p>;

  return (
    <div className="flex flex-col gap-4">
      <SectionTitle>ზიგზაგი</SectionTitle>
      <p className="text-sm text-ink-soft">სტატუსი: {detail.status}{pubStatus ? ` → ${pubStatus}` : ""}</p>

      <div className="flex items-end gap-2">
        <Button onClick={publish} disabled={busy}>გამოქვეყნება</Button>
        <Button variant="ghost" onClick={checkAll} disabled={busy}>სიტყვების შემოწმება</Button>
      </div>

      <PuzzleEntries detail={detail} reload={load} />
    </div>
  );
}
