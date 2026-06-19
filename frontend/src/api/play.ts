import type { PuzzleData } from "../engine/types";

const BASE = "/api/play";

export async function fetchToday(): Promise<PuzzleData> {
  const res = await fetch(`${BASE}/puzzles/today`);
  if (!res.ok) throw new Error(`today failed: ${res.status}`);
  return res.json();
}

export async function checkCells(
  date: string,
  cells: { row: number; col: number; value: string }[],
): Promise<{ results: { row: number; col: number; correct: boolean }[] }> {
  const res = await fetch(`${BASE}/puzzles/${date}/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cells }),
  });
  if (!res.ok) throw new Error(`check failed: ${res.status}`);
  return res.json();
}

export async function revealCells(
  date: string,
  cells: { row: number; col: number }[],
): Promise<{ cells: { row: number; col: number; value: string }[] }> {
  const res = await fetch(`${BASE}/puzzles/${date}/reveal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cells }),
  });
  if (!res.ok) throw new Error(`reveal failed: ${res.status}`);
  return res.json();
}
