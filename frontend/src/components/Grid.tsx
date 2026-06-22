import type { CrosswordEngine } from "../engine/crossword";

interface GridProps {
  engine: CrosswordEngine;
  onCellClick: (row: number, col: number) => void;
}

const U = 36; // cell size in SVG units; the grid scales to its container via viewBox

export function Grid({ engine, onCellClick }: GridProps) {
  const { rows, cols } = engine.size;
  const numbered = engine.numberedCells();
  const active = engine.active;
  const wordKeys = new Set(engine.currentWordCells().map((c) => `${c.row},${c.col}`));

  return (
    <div className="grid-wrap">
      <svg
        role="grid"
        className="grid-svg"
        viewBox={`0 0 ${cols * U} ${rows * U}`}
        style={{ maxWidth: cols * U }}
        aria-label="კროსვორდი"
      >
        {Array.from({ length: rows }).flatMap((_, row) =>
          Array.from({ length: cols }).map((_, col) => {
            const x = col * U;
            const y = row * U;
            if (engine.isBlock(row, col)) {
              return <rect key={`${row}-${col}`} data-block="true" className="cell-block" x={x} y={y} width={U} height={U} />;
            }
            const isActive = active.row === row && active.col === col;
            const num = numbered.find((c) => c.row === row && c.col === col)?.number;
            const value = engine.getValue(row, col);
            return (
              <g
                key={`${row}-${col}`}
                className="cell"
                role="gridcell"
                data-testid={`cell-${row}-${col}`}
                data-active={isActive ? "true" : "false"}
                data-inword={wordKeys.has(`${row},${col}`) ? "true" : "false"}
                data-status={engine.getStatus(row, col)}
                onClick={() => onCellClick(row, col)}
              >
                <rect className="cell-rect" x={x} y={y} width={U} height={U} />
                {num !== undefined && (
                  <text className="cell-num" x={x + 3} y={y + 10}>
                    {num}
                  </text>
                )}
                {value && (
                  <text className="cell-val" x={x + U / 2} y={y + U * 0.72} textAnchor="middle">
                    {value}
                  </text>
                )}
              </g>
            );
          }),
        )}
      </svg>
    </div>
  );
}
