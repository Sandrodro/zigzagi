import type { CrosswordEngine } from "../engine/crossword";

interface GridProps {
  engine: CrosswordEngine;
  onCellClick: (row: number, col: number) => void;
}

export function Grid({ engine, onCellClick }: GridProps) {
  const { rows, cols } = engine.size;
  const numbered = engine.numberedCells();
  const active = engine.active;
  const wordKeys = new Set(engine.currentWordCells().map((c) => `${c.row},${c.col}`));

  return (
    <div
      role="grid"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 2rem)`,
        gap: "1px",
      }}
    >
      {Array.from({ length: rows }).flatMap((_, row) =>
        Array.from({ length: cols }).map((_, col) => {
          if (engine.isBlock(row, col)) {
            return (
              <div
                key={`${row}-${col}`}
                data-block="true"
                style={{ width: "2rem", height: "2rem", background: "#222" }}
              />
            );
          }
          const isActive = active.row === row && active.col === col;
          const num = numbered.find((c) => c.row === row && c.col === col)?.number;
          return (
            <button
              key={`${row}-${col}`}
              data-testid={`cell-${row}-${col}`}
              data-active={isActive ? "true" : "false"}
              data-inword={wordKeys.has(`${row},${col}`) ? "true" : "false"}
              data-status={engine.getStatus(row, col)}
              onClick={() => onCellClick(row, col)}
              style={{ width: "2rem", height: "2rem", position: "relative" }}
            >
              {num !== undefined && (
                <span style={{ position: "absolute", top: 0, left: 1, fontSize: "0.5rem" }}>
                  {num}
                </span>
              )}
              {engine.getValue(row, col)}
            </button>
          );
        }),
      )}
    </div>
  );
}
