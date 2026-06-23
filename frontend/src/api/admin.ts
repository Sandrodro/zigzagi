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
  entry_count: number;
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

export async function createPuzzle(theme?: string, liveDate?: string): Promise<PuzzleSummary> {
  // Omit empty fields so the backend applies its defaults (theme/date guards removed).
  const body: Record<string, unknown> = {};
  if (theme && theme.trim()) body.theme = theme.trim();
  if (liveDate) body.live_date = liveDate;
  const res = await fetch(`${BASE}/puzzles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`createPuzzle failed: ${res.status}`);
  return res.json();
}

export async function fetchPuzzle(id: string): Promise<PuzzleDetail> {
  const res = await fetch(`${BASE}/puzzles/${id}`);
  if (!res.ok) throw new Error(`fetchPuzzle failed: ${res.status}`);
  return res.json();
}

export interface FillOpts {
  seedValue?: number;
  minSeeds?: number;
  templateId?: string;
  prefilled?: Record<string, string>;
  wordpool?: string;
}

export async function requestFill(puzzleId: string, opts: FillOpts = {}): Promise<{ job_id: string }> {
  const res = await fetch(`${BASE}/puzzles/${puzzleId}/fill`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      seed_value: opts.seedValue ?? 0,
      min_seeds: opts.minSeeds ?? 0,
      template_id: opts.templateId ?? null,
      prefilled: opts.prefilled ?? {},
      wordpool: opts.wordpool ?? "default",
    }),
  });
  if (!res.ok) throw new Error("failed to start fill");
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

export interface SlotDto {
  number: number;
  direction: "across" | "down";
  row: number;
  col: number;
  length: number;
}

export interface TemplateDto {
  id: string;
  rows: number;
  cols: number;
  blocks: [number, number][];
  slots: SlotDto[];
}

export async function listPuzzles(): Promise<PuzzleSummary[]> {
  const res = await fetch("/api/admin/puzzles");
  if (!res.ok) throw new Error("failed to list puzzles");
  return res.json();
}

export async function deletePuzzle(id: string): Promise<void> {
  const res = await fetch(`/api/admin/puzzles/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("failed to delete");
}

export async function fetchTemplates(): Promise<TemplateDto[]> {
  const res = await fetch("/api/admin/templates");
  if (!res.ok) throw new Error("failed to fetch templates");
  return res.json();
}

export async function schedulePuzzle(id: string, liveDate?: string): Promise<{ status: string; live_date: string }> {
  // Omit live_date so the backend defaults to today (date guard dropped).
  const body = liveDate ? { live_date: liveDate } : {};
  const res = await fetch(`/api/admin/puzzles/${id}/schedule`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("failed to schedule");
  return res.json();
}

export async function checkEntry(puzzleId: string, entryId: string): Promise<{ valid: boolean; replaced_with: string | null }> {
  const res = await fetch(`/api/admin/puzzles/${puzzleId}/entries/${entryId}/check`, { method: "POST" });
  if (!res.ok) throw new Error("failed to check entry");
  return res.json();
}

export async function checkPuzzleWords(puzzleId: string): Promise<{ checked: number; invalid: number; replaced: { number: number; direction: string; old: string; new: string }[] }> {
  const res = await fetch(`/api/admin/puzzles/${puzzleId}/check-words`, { method: "POST" });
  if (!res.ok) throw new Error("failed to check words");
  return res.json();
}

export async function addPoolWord(surface: string, theme: string): Promise<PoolWord> {
  const res = await fetch("/api/admin/pool", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ surface, theme }),
  });
  if (!res.ok) throw new Error("failed to add pool word");
  return res.json();
}
