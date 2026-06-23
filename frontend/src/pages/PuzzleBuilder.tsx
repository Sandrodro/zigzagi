import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { DataTable } from "../components/DataTable";
import {
  createPuzzle, fetchPuzzle, fetchTemplates, pollJob, requestFill,
  type PuzzleDetail, type TemplateDto,
} from "../api/admin";

const slotKey = (s: { number: number; direction: string }) =>
  `${s.number}${s.direction === "across" ? "A" : "D"}`;

export function PuzzleBuilder() {
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [words, setWords] = useState<Record<string, string>>({});
  const [theme, setTheme] = useState("");
  const [liveDate, setLiveDate] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [puzzleId, setPuzzleId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PuzzleDetail | null>(null);

  useEffect(() => { fetchTemplates().then(setTemplates).catch(() => setError("failed to load templates")); }, []);
  const template = templates.find((t) => t.id === templateId);

  async function generate() {
    setError(null); setDetail(null); setStatus("creating");
    try {
      const prefilled = Object.fromEntries(
        Object.entries(words).filter(([, w]) => w.trim().length > 0)
      );
      const p = await createPuzzle(theme.trim(), liveDate);
      setPuzzleId(p.id);
      const { job_id } = await requestFill(p.id, { templateId, prefilled, minSeeds: 0 });
      setStatus("filling");
      for (;;) {
        const job = await pollJob(job_id);
        if (job.status === "done") break;
        if (job.status === "failed") { setError(job.error ?? "fill failed"); setStatus(null); return; }
        await new Promise((r) => setTimeout(r, 1000));
      }
      setDetail(await fetchPuzzle(p.id));
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "error"); setStatus(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span>შაბლონი</span>
        <select aria-label="შაბლონი" value={templateId} onChange={(e) => { setTemplateId(e.target.value); setWords({}); }}>
          <option value="">—</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.id}</option>)}
        </select>
      </label>

      {template && (
        <div className="grid grid-cols-2 gap-2">
          {template.slots.map((s) => (
            <label key={slotKey(s)} className="flex items-center gap-2 text-sm">
              <span className="w-20 text-ink-soft">{s.number} {s.direction}</span>
              <Input
                aria-label={`${s.number} ${s.direction}`}
                maxLength={s.length}
                value={words[slotKey(s)] ?? ""}
                onChange={(e) => setWords((w) => ({ ...w, [slotKey(s)]: e.target.value }))}
              />
            </label>
          ))}
        </div>
      )}

      <label className="flex flex-col gap-1 text-sm"><span>თემა</span>
        <Input aria-label="თემა" value={theme} onChange={(e) => setTheme(e.target.value)} /></label>
      <label className="flex flex-col gap-1 text-sm"><span>თარიღი</span>
        <Input aria-label="თარიღი" type="date" value={liveDate} onChange={(e) => setLiveDate(e.target.value)} /></label>

      <Button onClick={generate} disabled={!templateId || !theme.trim() || !liveDate || status === "filling" || status === "creating"}>
        გენერაცია
      </Button>

      {status && status !== "done" && <p className="text-sm text-ink-soft">{status}…</p>}
      {error && <p className="text-sm text-cinnabar">{error}</p>}

      {detail && (
        <>
          <DataTable
            columns={[{ key: "number", header: "#" }, { key: "direction", header: "მიმართ." },
                      { key: "answer", header: "სიტყვა" }, { key: "provenance", header: "წყარო" }]}
            rows={detail.entries}
          />
          {puzzleId && (
            <Link to="/admin/puzzles/$puzzleId" params={{ puzzleId }} className="text-ochre underline">
              სიაში ნახვა →
            </Link>
          )}
        </>
      )}
    </div>
  );
}
