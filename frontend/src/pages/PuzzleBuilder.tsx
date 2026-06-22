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
import { SectionTitle } from "../components/ui/Typography";

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
      <div className="field">
        <label className="field__label" htmlFor="pb-theme">თემა</label>
        <input id="pb-theme" className="input" aria-label="theme" placeholder="თემა" value={theme} onChange={(e) => setTheme(e.target.value)} />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="pb-date">გამოქვეყნების თარიღი</label>
        <input id="pb-date" className="input" aria-label="live date" type="date" value={liveDate} onChange={(e) => setLiveDate(e.target.value)} />
      </div>
      <Button variant="primary" onClick={onCreate}>შექმნა</Button>

      {puzzleId && (
        <>
          <p className="stat">ID: {puzzleId}</p>
          <div className="toolbar">
            <label className="field__label" style={{ alignSelf: "center" }}>
              seeds min
              <input aria-label="min seeds" className="input" style={{ width: "5rem", marginLeft: "0.4rem" }} type="number" value={minSeeds} onChange={(e) => setMinSeeds(Number(e.target.value))} />
            </label>
            <label className="field__label" style={{ alignSelf: "center" }}>
              seed
              <input aria-label="seed value" className="input" style={{ width: "5rem", marginLeft: "0.4rem" }} type="number" value={seedValue} onChange={(e) => setSeedValue(Number(e.target.value))} />
            </label>
            <Button variant="primary" size="sm" onClick={onFill}>შევსება</Button>
          </div>
        </>
      )}

      {jobId && <Button size="sm" onClick={onCheck}>სტატუსის შემოწმება</Button>}
      {jobStatus && <p className="stat">სტატუსი: {jobStatus}</p>}
      {error && <p className="banner banner--warn" role="alert">{error}</p>}
      {entries.length > 0 && <DataTable columns={[...COLUMNS]} rows={entries} />}
    </section>
  );
}
