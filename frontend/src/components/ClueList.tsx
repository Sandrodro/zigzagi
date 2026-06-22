import type { ClueRef, Direction } from "../engine/types";

interface ClueListProps {
  across: ClueRef[];
  down: ClueRef[];
  activeNumber: number | null;
  activeDirection: Direction;
  onSelect: (number: number, direction: Direction) => void;
}

function Section({
  title,
  clues,
  direction,
  activeNumber,
  activeDirection,
  onSelect,
}: {
  title: string;
  clues: ClueRef[];
  direction: Direction;
  activeNumber: number | null;
  activeDirection: Direction;
  onSelect: (number: number, direction: Direction) => void;
}) {
  return (
    <div>
      <h3 className="mt-0 mb-2 border-b border-rule pb-1 text-[0.72rem] font-bold uppercase tracking-[0.12em] text-ink-soft">{title}</h3>
      <ul className="m-0 list-none p-0">
        {clues.map((c) => {
          const active = c.number === activeNumber && direction === activeDirection;
          return (
            <li key={`${direction}-${c.number}`}>
              <button
                className="flex w-full cursor-pointer gap-2 border-0 border-l-2 border-transparent px-2 py-1 text-left text-sm text-ink hover:bg-teal-faint data-[active=true]:border-l-teal data-[active=true]:bg-teal-tint"
                data-active={active ? "true" : "false"}
                onClick={() => onSelect(c.number, direction)}
              >
                <span className="min-w-[1.4em] font-serif font-semibold text-teal-deep">{c.number}</span>
                <span>{c.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function ClueList({ across, down, activeNumber, activeDirection, onSelect }: ClueListProps) {
  return (
    <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2">
      <Section title="ჰორიზონტალურად" clues={across} direction="across" activeNumber={activeNumber} activeDirection={activeDirection} onSelect={onSelect} />
      <Section title="ვერტიკალურად" clues={down} direction="down" activeNumber={activeNumber} activeDirection={activeDirection} onSelect={onSelect} />
    </div>
  );
}
