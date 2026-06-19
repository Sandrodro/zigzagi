import { useMutation, useQuery } from "@tanstack/react-query";

import type { PuzzleData } from "../engine/types";

const BASE = "/api/play";

type Cell = { row: number; col: number };
type CellValue = Cell & { value: string };
type CheckResult = { results: (Cell & { correct: boolean })[] };
type RevealResult = { cells: CellValue[] };

async function fetchToday(): Promise<PuzzleData> {
  const res = await fetch(`${BASE}/puzzles/today`);
  if (!res.ok) throw new Error(`today failed: ${res.status}`);
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

export function useToday() {
  return useQuery({ queryKey: ["today"], queryFn: fetchToday });
}

export function useCheckCells(date: string) {
  return useMutation({ mutationFn: (cells: CellValue[]) => postCheck(date, cells) });
}

export function useRevealCells(date: string) {
  return useMutation({ mutationFn: (cells: Cell[]) => postReveal(date, cells) });
}
