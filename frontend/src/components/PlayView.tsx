import { useEffect, useReducer, useRef, useState } from "react";

import { useCheckCells, useRevealCells, useToday } from "../api/play";
import { CrosswordEngine } from "../engine/crossword";
import { loadProgress, saveProgress } from "../progress/local";
import { useTimer } from "../hooks/useTimer";
import { ClueBar } from "./ClueBar";
import { ClueList } from "./ClueList";
import { Grid } from "./Grid";
import { Timer } from "./Timer";

export function PlayView() {
  const { data: puzzle } = useToday();
  const [engine, setEngine] = useState<CrosswordEngine | null>(null);
  // ponytail: mutable engine; counter forces a re-render after each mutation.
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const timer = useTimer();
  const inputRef = useRef<HTMLInputElement>(null);

  const checkMutation = useCheckCells(puzzle?.date ?? "");
  const revealMutation = useRevealCells(puzzle?.date ?? "");

  // Build the engine when the puzzle arrives, hydrating from localStorage.
  useEffect(() => {
    if (!puzzle) return;
    const e = new CrosswordEngine(puzzle);
    const saved = loadProgress(puzzle.date);
    if (saved) {
      e.loadFills(saved.fills);
      timer.set(saved.timerSeconds);
    }
    setEngine(e);
    timer.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle]);

  // Persist on every timer tick (captures both fills and elapsed seconds).
  useEffect(() => {
    if (!engine || !puzzle) return;
    saveProgress(puzzle.date, { fills: engine.getFills(), timerSeconds: timer.seconds, completedAt: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.seconds]);

  if (!engine || !puzzle) return <p>იტვირთება…</p>;

  const persist = () => {
    saveProgress(puzzle.date, { fills: engine.getFills(), timerSeconds: timer.seconds, completedAt: null });
    rerender();
  };

  const onInput = (ev: React.FormEvent<HTMLInputElement>) => {
    const ch = ev.currentTarget.value.slice(-1);
    ev.currentTarget.value = "";
    if (ch) {
      engine.type(ch);
      persist();
    }
  };

  const onKeyDown = (ev: React.KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === "Backspace") engine.backspace();
    else if (ev.key === "ArrowUp") engine.move("up");
    else if (ev.key === "ArrowDown") engine.move("down");
    else if (ev.key === "ArrowLeft") engine.move("left");
    else if (ev.key === "ArrowRight") engine.move("right");
    else if (ev.key === "Enter") engine.toggleDirection();
    else return;
    ev.preventDefault();
    persist();
  };

  const focusInput = () => inputRef.current?.focus();

  const onCheck = async (scope: "square" | "word" | "puzzle") => {
    const cells = engine
      .cellsForScope(scope)
      .map((c) => ({ row: c.row, col: c.col, value: engine.getValue(c.row, c.col) }))
      .filter((c) => c.value);
    if (cells.length === 0) return;
    const { results } = await checkMutation.mutateAsync(cells);
    engine.applyCheck(results);
    rerender();
  };

  const onReveal = async (scope: "square" | "word" | "puzzle") => {
    const cells = engine.cellsForScope(scope).map((c) => ({ row: c.row, col: c.col }));
    const { cells: filled } = await revealMutation.mutateAsync(cells);
    engine.applyReveal(filled);
    persist();
  };

  const cur = engine.currentClue();

  return (
    <div>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>{puzzle.theme}</h1>
        <Timer seconds={timer.seconds} />
      </header>

      <ClueBar
        clue={cur}
        direction={engine.direction}
        onPrev={() => { engine.prevClue(); rerender(); }}
        onNext={() => { engine.nextClue(); rerender(); }}
        onToggleDirection={() => { engine.toggleDirection(); rerender(); }}
      />

      <Grid
        engine={engine}
        onCellClick={(row, col) => {
          if (engine.active.row === row && engine.active.col === col) engine.toggleDirection();
          else engine.setActive(row, col);
          focusInput();
          rerender();
        }}
      />

      {/* Single off-screen input: summons the native keyboard on mobile, captures physical keys on desktop. */}
      <input
        ref={inputRef}
        aria-label="cell input"
        autoFocus
        defaultValue=""
        inputMode="text"
        autoCapitalize="none"
        autoCorrect="off"
        onInput={onInput}
        onKeyDown={onKeyDown}
        style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
      />

      <div style={{ display: "flex", gap: "0.5rem", margin: "0.5rem 0" }}>
        <button onClick={() => onCheck("square")}>Check square</button>
        <button onClick={() => onCheck("word")}>Check word</button>
        <button onClick={() => onCheck("puzzle")}>Check puzzle</button>
        <button onClick={() => onReveal("square")}>Reveal square</button>
        <button onClick={() => onReveal("word")}>Reveal word</button>
        <button onClick={() => onReveal("puzzle")}>Reveal puzzle</button>
      </div>

      <ClueList
        across={puzzle.clues.across}
        down={puzzle.clues.down}
        activeNumber={cur?.number ?? null}
        activeDirection={engine.direction}
        onSelect={(number, direction) => {
          if (engine.direction !== direction) engine.toggleDirection();
          const clue = (direction === "across" ? puzzle.clues.across : puzzle.clues.down).find((c) => c.number === number);
          if (clue) engine.setActive(clue.cell[0], clue.cell[1]);
          focusInput();
          rerender();
        }}
      />
    </div>
  );
}
