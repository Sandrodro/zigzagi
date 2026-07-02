import { useMutation, useQuery } from "@tanstack/react-query";

import type { PuzzleData } from "../engine/types";

const BASE = "/api/play";

type Cell = { row: number; col: number };
type CellValue = Cell & { value: string };
type CheckResult = { results: (Cell & { correct: boolean })[] };
type RevealResult = { cells: CellValue[] };

// "today" or an ISO date hit the date route; anything else is treated as a puzzle id.
async function fetchPuzzle(key: { id?: string; date?: string }): Promise<PuzzleData> {
  const path = key.id ? `by-id/${key.id}` : (key.date ?? "today");
  const res = await fetch(`${BASE}/puzzles/${path}`);
  if (!res.ok) throw new Error(`puzzle failed: ${res.status}`);
  return res.json();
}

async function postCheck(id: string, cells: CellValue[]): Promise<CheckResult> {
  const res = await fetch(`${BASE}/puzzles/by-id/${id}/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cells }),
  });
  if (!res.ok) throw new Error(`check failed: ${res.status}`);
  return res.json();
}

async function postReveal(id: string, cells: Cell[]): Promise<RevealResult> {
  const res = await fetch(`${BASE}/puzzles/by-id/${id}/reveal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cells }),
  });
  if (!res.ok) throw new Error(`reveal failed: ${res.status}`);
  return res.json();
}

export type PuzzleListItem = { id: string; date: string; status: string; created_at: string };

async function fetchPuzzleList(): Promise<PuzzleListItem[]> {
  const res = await fetch(`${BASE}/puzzles`);
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  return res.json();
}

// All published puzzles (past, present, or future live_date).
export function usePuzzleList() {
  return useQuery({ queryKey: ["puzzle-list"], queryFn: fetchPuzzleList });
}

// Open a puzzle by id (from /list) or, falling back, by date / "today".
export function usePuzzle(key: { id?: string; date?: string } = {}) {
  return useQuery({
    queryKey: ["puzzle", key.id ?? key.date ?? "today"],
    queryFn: () => fetchPuzzle(key),
  });
}

export function useCheckCells(id: string) {
  return useMutation({ mutationFn: (cells: CellValue[]) => postCheck(id, cells) });
}

export function useRevealCells(id: string) {
  return useMutation({ mutationFn: (cells: Cell[]) => postReveal(id, cells) });
}
