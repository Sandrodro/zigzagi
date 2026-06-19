import { useEffect, useReducer, useState } from "react";

import { checkCells, fetchToday, revealCells } from "../api/play";
import { CrosswordEngine } from "../engine/crossword";
import type { PuzzleData } from "../engine/types";
import { Grid } from "./Grid";

export function PlayView() {
  const [engine, setEngine] = useState<CrosswordEngine | null>(null);
  const [puzzle, setPuzzle] = useState<PuzzleData | null>(null);
  // ponytail: mutable engine; counter forces re-render after each mutation
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    fetchToday().then((p) => {
      setPuzzle(p);
      setEngine(new CrosswordEngine(p));
    });
  }, []);

  useEffect(() => {
    if (!engine) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Backspace") engine.backspace();
      else if (ev.key === "ArrowUp") engine.move("up");
      else if (ev.key === "ArrowDown") engine.move("down");
      else if (ev.key === "ArrowLeft") engine.move("left");
      else if (ev.key === "ArrowRight") engine.move("right");
      else if (ev.key.length === 1) engine.type(ev.key);
      else return;
      rerender();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine]);

  if (!engine || !puzzle) return <p>იტვირთება…</p>;

  const onCheck = async () => {
    const cells = engine
      .currentWordCells()
      .map((c) => ({ row: c.row, col: c.col, value: engine.getValue(c.row, c.col) }))
      .filter((c) => c.value);
    const { results } = await checkCells(puzzle.date, cells);
    engine.applyCheck(results);
    rerender();
  };

  const onReveal = async () => {
    const { row, col } = engine.active;
    const { cells } = await revealCells(puzzle.date, [{ row, col }]);
    engine.applyReveal(cells);
    rerender();
  };

  return (
    <div>
      <h1>{puzzle.theme}</h1>
      <Grid
        engine={engine}
        onCellClick={(row, col) => {
          engine.setActive(row, col);
          rerender();
        }}
      />
      <button onClick={onCheck}>Check</button>
      <button onClick={onReveal}>Reveal</button>
    </div>
  );
}
