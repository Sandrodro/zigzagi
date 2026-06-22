import { useMutation, useQuery } from "@tanstack/react-query";

import type { PuzzleData } from "../engine/types";

const BASE = "/api/play";

type Cell = { row: number; col: number };
type CellValue = Cell & { value: string };
type CheckResult = { results: (Cell & { correct: boolean })[] };
type RevealResult = { cells: CellValue[] };

export type PuzzleSummary = { date: string; theme: string; status: string };

async function fetchPuzzle(date: string): Promise<PuzzleData> {
  const res = await fetch(`${BASE}/puzzles/${date}`);
  if (!res.ok) throw new Error(`puzzle failed: ${res.status}`);
  return res.json();
}

async function fetchList(): Promise<PuzzleSummary[]> {
  const res = await fetch(`${BASE}/puzzles`);
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  return res.json();
}

async function postCheck(date: string, cells: CellValue[]): Promise<CheckResult> {
  const res = await fetch(`${BASE}/puzzles/${date}/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cells }),
  });
  if (!res.ok) throw new Error(`check failed: ${res.status}`);
  return res.json();
}

async function postReveal(date: string, cells: Cell[]): Promise<RevealResult> {
  const res = await fetch(`${BASE}/puzzles/${date}/reveal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cells }),
  });
  if (!res.ok) throw new Error(`reveal failed: ${res.status}`);
  return res.json();
}

// date defaults to the literal "today" path; an ISO date plays a specific published puzzle.
export function usePuzzle(date = "today") {
  return useQuery({ queryKey: ["puzzle", date], queryFn: () => fetchPuzzle(date) });
}

export function usePuzzleList() {
  return useQuery({ queryKey: ["puzzleList"], queryFn: fetchList });
}

export function useCheckCells(date: string) {
  return useMutation({ mutationFn: (cells: CellValue[]) => postCheck(date, cells) });
}

export function useRevealCells(date: string) {
  return useMutation({ mutationFn: (cells: Cell[]) => postReveal(date, cells) });
}
