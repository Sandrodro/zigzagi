import type { CrosswordEngine } from "../engine/crossword";

interface GridProps {
  engine: CrosswordEngine;
  onCellClick: (row: number, col: number) => void;
}

export const U = 54; // cell size in SVG units; the grid scales to its container via viewBox

// Constant contrasty ink lines; selection only swaps the fill.
const RECT =
  "fill-paper-raised stroke-ink [stroke-width:1] [shape-rendering:crispEdges] " +
  "group-data-[inword=true]:fill-cell-word " +
  "group-data-[active=true]:fill-cell-active";

// newdesign Cell letter style: Noto Sans Georgian, semibold (600), ~0.56× cell.
// Correct → blue letter; incorrect → letter stays black (a red cross is drawn over the cell).
const VAL =
  "font-sans font-semibold text-[30px] fill-black [fill:#121212] " +
  "group-data-[status=correct]:fill-blue-600 group-data-[status=revealed]:fill-ochre";

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
              return <rect key={`${row}-${col}`} data-block="true" className="fill-ink stroke-ink [stroke-width:1] [shape-rendering:crispEdges]" x={x} y={y} width={U} height={U} />;
            }
            const isActive = active.row === row && active.col === col;
            const num = numbered.find((c) => c.row === row && c.col === col)?.number;
            const value = engine.getValue(row, col);
            const status = engine.getStatus(row, col);
            return (
              <g
                key={`${row}-${col}`}
                className="group cursor-pointer"
                role="gridcell"
                data-testid={`cell-${row}-${col}`}
                data-active={isActive ? "true" : "false"}
                data-inword={!isActive && wordKeys.has(`${row},${col}`) ? "true" : "false"}
                data-status={status}
                onClick={() => onCellClick(row, col)}
              >
                <rect className={RECT} x={x} y={y} width={U} height={U} />
                {status === "incorrect" && (
                  <>
                    <line className="stroke-red-600 [stroke-width:2.5]" x1={x} y1={y} x2={x + U} y2={y + U} />
                    <line className="stroke-red-600 [stroke-width:2.5]" x1={x + U} y1={y} x2={x} y2={y + U} />
                  </>
                )}
                {num !== undefined && (
                  // newdesign Cell number style: medium (500), soft gray, tabular numerals.
                  <text
                    className="font-sans"
                    x={x + 3}
                    y={y + 12}
                    style={{ fontSize: 12, fontWeight: 500, fill: "#3a3a3a", fontFeatureSettings: "'tnum' 1, 'lnum' 1" }}
                  >
                    {num}
                  </text>
                )}
                {value && (
                  // key={value}: remount on letter change so the pop replays (newdesign cell-pop).
                  <text
                    key={value}
                    className={VAL}
                    x={x + U / 2}
                    y={y + U * 0.72}
                    textAnchor="middle"
                    style={{ transformBox: "fill-box", transformOrigin: "center", animation: "krosi-cell-pop var(--dur-base) var(--ease-pop)" }}
                  >
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
