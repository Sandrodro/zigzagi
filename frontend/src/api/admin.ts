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
