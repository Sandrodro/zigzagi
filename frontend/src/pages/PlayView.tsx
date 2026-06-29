import { useEffect, useReducer, useRef, useState } from "react";

import { useCheckCells, usePuzzle } from "../api/play";
import { CrosswordEngine } from "../engine/crossword";
import { loadProgress, saveProgress } from "../progress/local";
import { useTimer } from "../hooks/useTimer";
import { ClueBar } from "../components/ClueBar";
import { ClueList } from "../components/ClueList";
import { Grid, U } from "../components/Grid";

export function PlayView({ id, date }: { id?: string; date?: string } = {}) {
  const { data: puzzle } = usePuzzle({ id, date });
  const [engine, setEngine] = useState<CrosswordEngine | null>(null);
  // ponytail: mutable engine; counter forces a re-render after each mutation.
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const timer = useTimer();
  const inputRef = useRef<HTMLInputElement>(null);
  const [completedAt, setCompletedAt] = useState<string | null>(null);

  const checkMutation = useCheckCells(puzzle?.id ?? "");

  // Keyboard inset: keep the mobile clue bar pinned just above the native keyboard.
  const [kbInset, setKbInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setKbInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  // Build the engine when the puzzle arrives, hydrating from localStorage.
  useEffect(() => {
    if (!puzzle) return;
    const e = new CrosswordEngine(puzzle);
    const saved = loadProgress(puzzle.id);
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
    saveProgress(puzzle.id, { fills: engine.getFills(), timerSeconds: timer.seconds, completedAt: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer.seconds]);

  // When the grid first fills up, run a full check; if all correct, finish.
  useEffect(() => {
    if (!engine || !puzzle || completedAt) return;
    if (!engine.isComplete()) return;
    (async () => {
      const cells = engine
        .cellsForScope("puzzle")
        .map((c) => ({ row: c.row, col: c.col, value: engine.getValue(c.row, c.col) }));
      const { results } = await checkMutation.mutateAsync(cells);
      engine.applyCheck(results);
      if (results.every((r) => r.correct)) {
        timer.pause();
        const stamp = new Date().toISOString();
        setCompletedAt(stamp);
        saveProgress(puzzle.id, { fills: engine.getFills(), timerSeconds: timer.seconds, completedAt: stamp });
      }
      rerender();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine?.isComplete(), completedAt]);

  if (!engine || !puzzle) return <p className="mx-auto max-w-[560px] px-5 pt-8 text-ink-soft">იტვირთება…</p>;

  const persist = () => {
    saveProgress(puzzle.id, { fills: engine.getFills(), timerSeconds: timer.seconds, completedAt: null });
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

  const cur = engine.currentClue();
  const gridWidth = engine.size.cols * U;
  const gridHeight = engine.size.rows * U;

  const clueNav = {
    clue: cur,
    direction: engine.direction,
    onPrev: () => { engine.prevClue(); focusInput(); rerender(); },
    onNext: () => { engine.nextClue(); focusInput(); rerender(); },
    onToggleDirection: () => { engine.toggleDirection(); focusInput(); rerender(); },
  };

  return (
    <div className="mx-auto max-w-[1080px] px-5 pt-8 pb-28 md:pb-16">
      <div className="flex flex-col gap-8 md:flex-row md:items-start">
        {/* Left half: header + current-clue bar + grid, the block sized to the grid. */}
        <div className="w-full md:flex-1">
          <div className="mx-auto w-full" style={{ maxWidth: gridWidth }}>
            {/* One clue bar: fixed above the keyboard on mobile, static above the grid on desktop. */}
            <div
              className="fixed inset-x-0 z-20 px-2 md:static md:mb-4 md:px-0"
              style={{ bottom: kbInset }}
            >
              <ClueBar {...clueNav} />
            </div>

            <Grid
              engine={engine}
              onCellClick={(row, col) => {
                if (engine.active.row === row && engine.active.col === col) engine.toggleDirection();
                else engine.setActive(row, col);
                focusInput();
                rerender();
              }}
            />
          </div>
        </div>

        {/* Right half: scrollable clue columns (desktop only). */}
        <div className="hidden w-full md:block md:flex-1">
          <ClueList
            across={puzzle.clues.across}
            down={puzzle.clues.down}
            activeNumber={cur?.number ?? null}
            activeDirection={engine.direction}
            columnMaxHeight={gridHeight}
            onSelect={(number, direction) => {
              if (engine.direction !== direction) engine.toggleDirection();
              const clue = (direction === "across" ? puzzle.clues.across : puzzle.clues.down).find((c) => c.number === number);
              if (clue) engine.setActive(clue.cell[0], clue.cell[1]);
              focusInput();
              rerender();
            }}
          />
        </div>
      </div>

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
    </div>
  );
}
