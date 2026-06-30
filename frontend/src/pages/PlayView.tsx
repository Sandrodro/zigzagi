import { useEffect, useReducer, useRef, useState } from "react";

import { useCheckCells, useRevealCells, usePuzzle } from "../api/play";
import { CrosswordEngine } from "../engine/crossword";
import type { Scope } from "../engine/types";
import { PlayToolbar } from "../components/PlayToolbar";
import { loadProgress, saveProgress } from "../progress/local";
import { useTimer } from "../hooks/useTimer";
import { ClueBar } from "../components/ClueBar";
import { ClueList } from "../components/ClueList";
import { Grid, U } from "../components/Grid";
import { PageTitle } from "../components/ui/Typography";

// "2026-06-29" -> "ორშაბათი, 29 ივნისი, 2026" (parsed as local time, not UTC).
function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ka-GE", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

export function PlayView({ id, date }: { id?: string; date?: string } = {}) {
  const { data: puzzle } = usePuzzle({ id, date });
  const [engine, setEngine] = useState<CrosswordEngine | null>(null);
  // ponytail: mutable engine; counter forces a re-render after each mutation.
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const timer = useTimer();
  const inputRef = useRef<HTMLInputElement>(null);
  const [completedAt, setCompletedAt] = useState<string | null>(null);

  const checkMutation = useCheckCells(puzzle?.id ?? "");
  const revealMutation = useRevealCells(puzzle?.id ?? "");

  // Track the visual viewport: keyboard inset (pin the clue bar) + size (fit the grid).
  const [vp, setVp] = useState({ kbInset: 0, w: 0, h: 0 });
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () =>
      setVp({ kbInset: Math.max(0, window.innerHeight - vv.height - vv.offsetTop), w: vv.width, h: vv.height });
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
    // Focus the off-screen input without scrolling to it (would otherwise scroll the page down on load).
    inputRef.current?.focus({ preventScroll: true });
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

  // preventScroll: the input sits off-screen, so a plain focus() would scroll the page to it.
  const focusInput = () => inputRef.current?.focus({ preventScroll: true });

  const handleClear = (scope: Scope) => {
    engine.clear(scope);
    persist();
  };

  const handleCheck = async (scope: Scope) => {
    const cells = engine
      .cellsForScope(scope)
      .map((c) => ({ row: c.row, col: c.col, value: engine.getValue(c.row, c.col) }));
    const { results } = await checkMutation.mutateAsync(cells);
    engine.applyCheck(results);
    rerender();
  };

  const handleReveal = async (scope: Scope) => {
    const cells = engine.cellsForScope(scope).map((c) => ({ row: c.row, col: c.col }));
    const { cells: revealed } = await revealMutation.mutateAsync(cells);
    engine.applyReveal(revealed);
    persist();
  };

  const cur = engine.currentClue();
  const gridWidth = engine.size.cols * U;
  const gridHeight = engine.size.rows * U;

  // On mobile, cap the grid so it fits the height left over after the header / toolbar / clue bar /
  // keyboard, keeping the whole grid visible without scrolling. (~190px: header + toolbar + clue bar + pads.)
  const isMobile = vp.w > 0 && vp.w < 768;
  const aspect = engine.size.cols / engine.size.rows;
  const gridMax = isMobile
    ? Math.max(160, Math.min(vp.w - 16, (vp.h - 190) * aspect))
    : gridWidth;

  const clueNav = {
    clue: cur,
    direction: engine.direction,
    onPrev: () => { engine.prevClue(); focusInput(); rerender(); },
    onNext: () => { engine.nextClue(); focusInput(); rerender(); },
    onToggleDirection: () => { engine.toggleDirection(); focusInput(); rerender(); },
  };

  return (
    <div className="mx-auto max-w-[1080px] px-5 pt-4 pb-4 md:pt-8 md:pb-16">
      <header className="mb-3 flex flex-wrap items-baseline gap-x-3">
        <PageTitle className="text-[1.4rem] italic md:text-[1.85rem]" style={{ letterSpacing: "normal" }}>{puzzle.theme}</PageTitle>
        <span className="font-serif text-[0.9rem] md:text-[1.1rem]">{formatDate(puzzle.date)}</span>
      </header>
      <PlayToolbar onClear={handleClear} onReveal={handleReveal} onCheck={handleCheck} />
      <div className="flex flex-col gap-8 md:flex-row md:items-start">
        {/* Left half: header + current-clue bar + grid, the block sized to the grid. */}
        <div className="w-full md:flex-1">
          <div className="mx-auto w-full" style={{ maxWidth: gridMax }}>
            {/* One clue bar: fixed above the keyboard on mobile, static above the grid on desktop. */}
            <div
              className="fixed inset-x-0 z-20 px-2 md:static md:mb-4 md:px-0"
              style={{ bottom: vp.kbInset }}
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
