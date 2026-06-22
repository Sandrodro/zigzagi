import { useState } from "react";

import {
  createPuzzle,
  fetchPuzzle,
  pollJob,
  requestFill,
  type PuzzleEntry,
} from "../api/admin";
import { DataTable } from "../components/DataTable";

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
    <div>
      <h2>ფაზლის აწყობა</h2>
      <input aria-label="theme" placeholder="თემა" value={theme} onChange={(e) => setTheme(e.target.value)} />
      <input aria-label="live date" type="date" value={liveDate} onChange={(e) => setLiveDate(e.target.value)} />
      <button onClick={onCreate}>შექმნა</button>

      {puzzleId && (
        <>
          <p>ID: {puzzleId}</p>
          <label>
            seeds min
            <input
              aria-label="min seeds"
              type="number"
              value={minSeeds}
              onChange={(e) => setMinSeeds(Number(e.target.value))}
            />
          </label>
          <label>
            seed
            <input
              aria-label="seed value"
              type="number"
              value={seedValue}
              onChange={(e) => setSeedValue(Number(e.target.value))}
            />
          </label>
          <button onClick={onFill}>შევსება</button>
        </>
      )}

      {jobId && <button onClick={onCheck}>სტატუსის შემოწმება</button>}
      {jobStatus && <p>სტატუსი: {jobStatus}</p>}
      {error && <p role="alert">{error}</p>}
      {entries.length > 0 && <DataTable columns={[...COLUMNS]} rows={entries} />}
    </div>
  );
}
