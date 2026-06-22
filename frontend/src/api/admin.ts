const BASE = "/api/admin";

export interface Candidate {
  id: string;
  surface: string;
  lemma: string;
  length: number;
  snippet: string | null;
}

export interface ExtractResult {
  dropped_count: number;
  candidates: Candidate[];
}

export interface PoolWord {
  id: string;
  surface: string;
  length: number;
  status: string;
  snippet: string | null;
}

export interface Suggestion {
  word: string;
  reason: string;
  in_corpus: boolean;
}

export type BulkOp = { id: string; action: "accept" | "reject" | "edit"; surface?: string };

export async function extractText(text: string, theme: string): Promise<ExtractResult> {
  const res = await fetch(`${BASE}/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, theme }),
  });
  if (!res.ok) throw new Error(`extract failed: ${res.status}`);
  return res.json();
}

export async function fetchPool(status?: string): Promise<PoolWord[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await fetch(`${BASE}/pool${qs}`);
  if (!res.ok) throw new Error(`pool failed: ${res.status}`);
  return res.json();
}

export async function bulkUpdate(ops: BulkOp[]): Promise<{ updated: number }> {
  const res = await fetch(`${BASE}/pool/bulk`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ops }),
  });
  if (!res.ok) throw new Error(`bulk failed: ${res.status}`);
  return res.json();
}

export async function suggest(theme: string): Promise<Suggestion[]> {
  const res = await fetch(`${BASE}/suggest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ theme }),
  });
  if (!res.ok) throw new Error(`suggest failed: ${res.status}`);
  return res.json();
}

export interface WordlistWord {
  id: string;
  word: string;
  length: number;
  status: string;
}

export interface WordlistStats {
  active: number;
  blocked: number;
  by_length: Record<string, number>;
}

export interface ImportResult {
  added: number;
  rejected: { word: string; reason: string }[];
}

export async function fetchWordlist(params?: { status?: string; search?: string }): Promise<WordlistWord[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.search) qs.set("search", params.search);
  const suffix = qs.toString() ? `?${qs}` : "";
  const res = await fetch(`${BASE}/wordlist${suffix}`);
  if (!res.ok) throw new Error(`wordlist failed: ${res.status}`);
  return res.json();
}

export async function addWord(word: string): Promise<WordlistWord> {
  const res = await fetch(`${BASE}/wordlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ word }),
  });
  if (!res.ok) throw new Error(`addWord failed: ${res.status}`);
  return res.json();
}

export async function updateWord(
  id: string,
  patch: { word?: string; status?: string },
): Promise<WordlistWord> {
  const res = await fetch(`${BASE}/wordlist/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`updateWord failed: ${res.status}`);
  return res.json();
}

export async function bulkImport(text: string): Promise<ImportResult> {
  const res = await fetch(`${BASE}/wordlist/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`bulkImport failed: ${res.status}`);
  return res.json();
}

export async function fetchWordlistStats(): Promise<WordlistStats> {
  const res = await fetch(`${BASE}/wordlist/stats`);
  if (!res.ok) throw new Error(`stats failed: ${res.status}`);
  return res.json();
}

export interface PuzzleSummary {
  id: string;
  theme: string;
  live_date: string;
  status: string;
}

export interface PuzzleEntry {
  id: string;
  number: number;
  direction: string;
  answer: string;
  row: number;
  col: number;
  clue: string | null;
  clue_status: string;
  provenance: string;
}

export interface PuzzleDetail extends PuzzleSummary {
  grid_template: unknown;
  entries: PuzzleEntry[];
}

export interface JobStatus {
  status: string;
  result: unknown;
  error: string | null;
}

export async function createPuzzle(theme: string, liveDate: string): Promise<PuzzleSummary> {
  const res = await fetch(`${BASE}/puzzles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ theme, live_date: liveDate }),
  });
  if (!res.ok) throw new Error(`createPuzzle failed: ${res.status}`);
  return res.json();
}

export async function fetchPuzzle(id: string): Promise<PuzzleDetail> {
  const res = await fetch(`${BASE}/puzzles/${id}`);
  if (!res.ok) throw new Error(`fetchPuzzle failed: ${res.status}`);
  return res.json();
}

export async function requestFill(
  puzzleId: string,
  seedValue: number,
  minSeeds: number,
): Promise<{ job_id: string }> {
  const res = await fetch(`${BASE}/puzzles/${puzzleId}/fill`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seed_value: seedValue, min_seeds: minSeeds }),
  });
  if (!res.ok) throw new Error(`requestFill failed: ${res.status}`);
  return res.json();
}

export async function pollJob(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${BASE}/jobs/${jobId}`);
  if (!res.ok) throw new Error(`pollJob failed: ${res.status}`);
  return res.json();
}

export interface Runway {
  runway_days: number;
  warning: boolean;
}

export async function fetchRunway(): Promise<Runway> {
  const res = await fetch(`${BASE}/dashboard/runway`);
  if (!res.ok) throw new Error(`runway failed: ${res.status}`);
  return res.json();
}

export async function generateClues(puzzleId: string): Promise<{ generated: number }> {
  const res = await fetch(`${BASE}/puzzles/${puzzleId}/clues`, { method: "POST" });
  if (!res.ok) throw new Error(`generateClues failed: ${res.status}`);
  return res.json();
}

export async function reviewClue(
  puzzleId: string,
  entryId: string,
  action: "accept" | "edit" | "reject",
  clue?: string,
): Promise<{ clue_status: string }> {
  const res = await fetch(`${BASE}/puzzles/${puzzleId}/clues/${entryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, clue }),
  });
  if (!res.ok) throw new Error(`reviewClue failed: ${res.status}`);
  return res.json();
}
