interface TemplateGridProps {
  rows: number;
  cols: number;
  blocks: [number, number][];
  fills?: Record<string, string>;
  cell?: number;
}

export function TemplateGrid({ rows, cols, blocks, fills, cell = 18 }: TemplateGridProps) {
  const blockSet = new Set(blocks.map(([r, c]) => `${r},${c}`));
  const w = cols * cell;
  const h = rows * cell;

  return (
    <svg
      role="img"
      aria-label="შაბლონი"
      className="h-auto border-[1.5px] border-ink bg-paper-raised"
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
    >
      {Array.from({ length: rows }).flatMap((_, row) =>
        Array.from({ length: cols }).map((_, col) => {
          const x = col * cell;
          const y = row * cell;
          const key = `${row},${col}`;
          if (blockSet.has(key)) {
            return (
              <rect
                key={key}
                data-block="true"
                className="fill-ink"
                x={x}
                y={y}
                width={cell}
                height={cell}
              />
            );
          }
          const letter = fills?.[key];
          return (
            <g key={key} data-testid={`tcell-${row}-${col}`}>
              <rect
                className="fill-paper-raised stroke-rule [stroke-width:1]"
                x={x}
                y={y}
                width={cell}
                height={cell}
              />
              {letter && (
                <text
                  className="font-serif fill-ink"
                  fontSize={cell * 0.55}
                  x={x + cell / 2}
                  y={y + cell * 0.72}
                  textAnchor="middle"
                >
                  {letter}
                </text>
              )}
            </g>
          );
        }),
      )}
    </svg>
  );
}
