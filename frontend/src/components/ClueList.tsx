import type { ClueRef, Direction } from "../engine/types";

interface ClueListProps {
  across: ClueRef[];
  down: ClueRef[];
  activeNumber: number | null;
  activeDirection: Direction;
  onSelect: (number: number, direction: Direction) => void;
  /** Max height (px) for each scrollable column; defaults to unbounded. */
  columnMaxHeight?: number;
}

function Section({
  title,
  clues,
  direction,
  activeNumber,
  activeDirection,
  onSelect,
  columnMaxHeight,
}: {
  title: string;
  clues: ClueRef[];
  direction: Direction;
  activeNumber: number | null;
  activeDirection: Direction;
  onSelect: (number: number, direction: Direction) => void;
  columnMaxHeight?: number;
}) {
  return (
    <div>
      <h3 className="mt-0 mb-2 border-b border-rule pb-1 text-[0.85rem] font-bold text-black">{title}</h3>
      <ul className="m-0 list-none overflow-y-auto p-0" style={{ maxHeight: columnMaxHeight }}>
        {clues.map((c) => {
          const active = c.number === activeNumber && direction === activeDirection;
          return (
            <li key={`${direction}-${c.number}`}>
              <button
                className="flex w-full cursor-pointer gap-2 border-0 px-2 py-1 text-left text-sm text-ink hover:bg-teal-faint data-[active=true]:bg-teal-tint"
                data-active={active ? "true" : "false"}
                onClick={() => onSelect(c.number, direction)}
              >
                <span className="min-w-[1.4em] font-serif font-semibold text-black">{c.number}</span>
                <span>{c.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ClueList({ across, down, activeNumber, activeDirection, onSelect, columnMaxHeight }: ClueListProps) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      <Section title="ჰორიზონტალურად" clues={across} direction="across" activeNumber={activeNumber} activeDirection={activeDirection} onSelect={onSelect} columnMaxHeight={columnMaxHeight} />
      <Section title="ვერტიკალურად" clues={down} direction="down" activeNumber={activeNumber} activeDirection={activeDirection} onSelect={onSelect} columnMaxHeight={columnMaxHeight} />
    </div>
  );
}
