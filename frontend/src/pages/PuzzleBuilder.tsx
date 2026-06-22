import { useState } from "react";

import {
  createPuzzle,
  fetchPuzzle,
  pollJob,
  requestFill,
  type PuzzleEntry,
} from "../api/admin";
import { DataTable } from "../components/DataTable";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { SectionTitle } from "../components/ui/Typography";

const LABEL = "text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-ink-soft";

const COLUMNS = [
  { key: "number", header: "№" },
  { key: "direction", header: "მიმართ." },
  { key: "answer", header: "პასუხი" },
  { key: "provenance", header: "წყარო" },
] as const;

export function PuzzleBuilder() {
  const [theme, setTheme] = useState("");
  const [liveDate, setLiveDate] = useState("");
  const [puzzleId, setPuzzleId] = useState<string | null>(null);
  const [minSeeds, setMinSeeds] = useState(15);
  const [seedValue, setSeedValue] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<PuzzleEntry[]>([]);

  const onCreate = async () => {
    if (!theme.trim() || !liveDate) return;
    const p = await createPuzzle(theme.trim(), liveDate);
    setPuzzleId(p.id);
    setEntries([]);
    setJobStatus(null);
    setError(null);
  };

  const onFill = async () => {
    if (!puzzleId) return;
    const { job_id } = await requestFill(puzzleId, seedValue, minSeeds);
    setJobId(job_id);
    setJobStatus("pending");
    setError(null);
  };

  const onCheck = async () => {
    if (!jobId || !puzzleId) return;
    const job = await pollJob(jobId);
    setJobStatus(job.status);
    if (job.status === "failed") {
      setError(job.error);
    } else if (job.status === "done") {
      const detail = await fetchPuzzle(puzzleId);
      setEntries(detail.entries);
    }
  };

  return (
    <section>
      <SectionTitle>ფაზლის აწყობა</SectionTitle>
      <div className="my-2.5 flex flex-col gap-1.5">
        <label className={LABEL} htmlFor="pb-theme">თემა</label>
        <Input id="pb-theme" aria-label="theme" placeholder="თემა" value={theme} onChange={(e) => setTheme(e.target.value)} />
      </div>
      <div className="my-2.5 flex flex-col gap-1.5">
        <label className={LABEL} htmlFor="pb-date">გამოქვეყნების თარიღი</label>
        <Input id="pb-date" aria-label="live date" type="date" value={liveDate} onChange={(e) => setLiveDate(e.target.value)} />
      </div>
      <Button variant="primary" onClick={onCreate}>შექმნა</Button>

      {puzzleId && (
        <>
          <p className="font-mono text-[0.85rem] text-ink-soft">ID: {puzzleId}</p>
          <div className="my-4 flex flex-wrap items-center gap-2">
            <label className={`${LABEL} flex items-center gap-1.5`}>
              seeds min
              <Input aria-label="min seeds" className="w-20" type="number" value={minSeeds} onChange={(e) => setMinSeeds(Number(e.target.value))} />
            </label>
            <label className={`${LABEL} flex items-center gap-1.5`}>
              seed
              <Input aria-label="seed value" className="w-20" type="number" value={seedValue} onChange={(e) => setSeedValue(Number(e.target.value))} />
            </label>
            <Button variant="primary" size="sm" onClick={onFill}>შევსება</Button>
          </div>
        </>
      )}

      {jobId && <Button size="sm" onClick={onCheck}>სტატუსის შემოწმება</Button>}
      {jobStatus && <p className="font-mono text-[0.85rem] text-ink-soft">სტატუსი: {jobStatus}</p>}
      {error && <p className="rounded border border-rule border-l-[3px] border-l-cinnabar bg-[#f8efef] px-3 py-1.5" role="alert">{error}</p>}
      {entries.length > 0 && <DataTable columns={[...COLUMNS]} rows={entries} />}
    </section>
  );
}
