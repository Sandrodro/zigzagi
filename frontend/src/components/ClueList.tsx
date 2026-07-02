import type { ClueRef, Direction } from "../engine/types";

interface ClueListProps {
  across: ClueRef[];
  down: ClueRef[];
  activeNumber: number | null;
  activeDirection: Direction;
  onSelect: (number: number, direction: Direction) => void;
  /** Max height (px) for each scrollable column; defaults to unbounded. */
  columnMaxHeight?: number;
  /** Set of `${direction}-${number}` keys whose answer is fully filled in (dimmed). */
  filled?: Set<string>;
  /** The other clue crossing the active cell, if any — flagged with a rectangle in the left gutter. */
  crossing?: { number: number; direction: Direction } | null;
}

function Section({
  title,
  clues,
  direction,
  activeNumber,
  activeDirection,
  onSelect,
  columnMaxHeight,
  filled,
  crossing,
}: {
  title: string;
  clues: ClueRef[];
  direction: Direction;
  activeNumber: number | null;
  activeDirection: Direction;
  onSelect: (number: number, direction: Direction) => void;
  columnMaxHeight?: number;
  filled?: Set<string>;
  crossing?: { number: number; direction: Direction } | null;
}) {
  return (
    <div>
      <h3 className="mt-0 mb-2 border-b border-rule pb-1 pr-4 text-right text-[0.85rem] font-bold text-black">{title}</h3>
      <ul className="m-0 list-none overflow-y-auto p-0" style={{ maxHeight: columnMaxHeight }}>
        {clues.map((c) => {
          const active = c.number === activeNumber && direction === activeDirection;
          const isFilled = filled?.has(`${direction}-${c.number}`);
          const isCrossing = crossing?.direction === direction && crossing?.number === c.number;
          return (
            <li key={`${direction}-${c.number}`}>
              <button
                className="relative flex w-full cursor-pointer gap-2 border-0 py-1 pl-4 pr-2 text-left text-sm text-black hover:bg-teal-faint data-[active=true]:bg-teal-tint data-[filled=true]:opacity-40"
                data-active={active ? "true" : "false"}
                data-filled={isFilled ? "true" : "false"}
                onClick={() => onSelect(c.number, direction)}
              >
                {isCrossing && <span className="absolute inset-y-0 left-0 w-1.5 bg-teal-tint" aria-hidden="true" />}
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

export function ClueList({ across, down, activeNumber, activeDirection, onSelect, columnMaxHeight, filled, crossing }: ClueListProps) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      <Section title="თარაზულად" clues={across} direction="across" activeNumber={activeNumber} activeDirection={activeDirection} onSelect={onSelect} columnMaxHeight={columnMaxHeight} filled={filled} crossing={crossing} />
      <Section title="შვეულად" clues={down} direction="down" activeNumber={activeNumber} activeDirection={activeDirection} onSelect={onSelect} columnMaxHeight={columnMaxHeight} filled={filled} crossing={crossing} />
    </div>
  );
}
