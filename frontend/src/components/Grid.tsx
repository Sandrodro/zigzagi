import type { CrosswordEngine } from "../engine/crossword";

interface GridProps {
  engine: CrosswordEngine;
  onCellClick: (row: number, col: number) => void;
}

export const U = 54; // cell size in SVG units; the grid scales to its container via viewBox

// Constant contrasty ink lines; selection only swaps the fill.
const RECT =
  "fill-paper-raised stroke-ink [stroke-width:1.5] [shape-rendering:crispEdges] " +
  "group-data-[inword=true]:fill-cell-word " +
  "group-data-[active=true]:fill-cell-active";

const VAL =
  "font-serif text-[18px] fill-black [fill:#000] " +
  "group-data-[status=correct]:fill-teal group-data-[status=incorrect]:fill-cinnabar group-data-[status=revealed]:fill-ochre";

export function Grid({ engine, onCellClick }: GridProps) {
  const { rows, cols } = engine.size;
  const numbered = engine.numberedCells();
  const active = engine.active;
  const wordKeys = new Set(engine.currentWordCells().map((c) => `${c.row},${c.col}`));

  return (
    <div className="my-2 flex justify-center">
      <svg
        role="grid"
        className="h-auto w-full border-2 border-ink bg-paper-raised"
        viewBox={`0 0 ${cols * U} ${rows * U}`}
        style={{ maxWidth: cols * U }}
        aria-label="კროსვორდი"
      >
        {Array.from({ length: rows }).flatMap((_, row) =>
          Array.from({ length: cols }).map((_, col) => {
            const x = col * U;
            const y = row * U;
            if (engine.isAbsent(row, col)) {
              return null; // outside the puzzle shape — empty background
            }
            if (engine.isBlock(row, col)) {
              return <rect key={`${row}-${col}`} data-block="true" className="fill-ink stroke-ink [stroke-width:1.5] [shape-rendering:crispEdges]" x={x} y={y} width={U} height={U} />;
            }
            const isActive = active.row === row && active.col === col;
            const num = numbered.find((c) => c.row === row && c.col === col)?.number;
            const value = engine.getValue(row, col);
            return (
              <g
                key={`${row}-${col}`}
                className="group cursor-pointer"
                role="gridcell"
                data-testid={`cell-${row}-${col}`}
                data-active={isActive ? "true" : "false"}
                data-inword={!isActive && wordKeys.has(`${row},${col}`) ? "true" : "false"}
                data-status={engine.getStatus(row, col)}
                onClick={() => onCellClick(row, col)}
              >
                <rect className={RECT} x={x} y={y} width={U} height={U} />
                {num !== undefined && (
                  <text fill="#000" className="font-serif text-[11px]" x={x + 3} y={y + 12}>
                    {num}
                  </text>
                )}
                {value && (
                  <text className={VAL} x={x + U / 2} y={y + U * 0.72} textAnchor="middle">
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
