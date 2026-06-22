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
      <h3 className="clue-col__title">{title}</h3>
      <ul className="clue-list">
        {clues.map((c) => {
          const active = c.number === activeNumber && direction === activeDirection;
          return (
            <li key={`${direction}-${c.number}`}>
              <button className="clue-item" data-active={active ? "true" : "false"} onClick={() => onSelect(c.number, direction)}>
                <span className="clue-item__num">{c.number}</span>
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
    <div className="clue-cols">
      <Section title="ჰორიზონტალურად" clues={across} direction="across" activeNumber={activeNumber} activeDirection={activeDirection} onSelect={onSelect} />
      <Section title="ვერტიკალურად" clues={down} direction="down" activeNumber={activeNumber} activeDirection={activeDirection} onSelect={onSelect} />
    </div>
  );
}
