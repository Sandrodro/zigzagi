import type { CrosswordEngine } from "../engine/crossword";

interface GridProps {
  engine: CrosswordEngine;
  onCellClick: (row: number, col: number) => void;
}

const U = 36; // cell size in SVG units; the grid scales to its container via viewBox

const RECT =
  "fill-paper-raised stroke-rule [stroke-width:1] " +
  "group-data-[inword=true]:fill-teal-faint " +
  "group-data-[active=true]:fill-teal-tint group-data-[active=true]:stroke-teal group-data-[active=true]:[stroke-width:1.5]";

const VAL =
  "font-serif text-[18px] fill-ink " +
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
        className="h-auto w-full border-[1.5px] border-ink bg-paper-raised"
        viewBox={`0 0 ${cols * U} ${rows * U}`}
        style={{ maxWidth: cols * U }}
        aria-label="კროსვორდი"
      >
        {Array.from({ length: rows }).flatMap((_, row) =>
          Array.from({ length: cols }).map((_, col) => {
            const x = col * U;
            const y = row * U;
            if (engine.isBlock(row, col)) {
              return <rect key={`${row}-${col}`} data-block="true" className="fill-ink" x={x} y={y} width={U} height={U} />;
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
                data-inword={wordKeys.has(`${row},${col}`) ? "true" : "false"}
                data-status={engine.getStatus(row, col)}
                onClick={() => onCellClick(row, col)}
              >
                <rect className={RECT} x={x} y={y} width={U} height={U} />
                {num !== undefined && (
                  <text className="fill-ink-soft font-serif text-[8px]" x={x + 3} y={y + 10}>
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
