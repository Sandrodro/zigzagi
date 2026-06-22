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
      <h3>{title}</h3>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {clues.map((c) => {
          const active = c.number === activeNumber && direction === activeDirection;
          return (
            <li key={`${direction}-${c.number}`}>
              <button
                data-active={active ? "true" : "false"}
                onClick={() => onSelect(c.number, direction)}
                style={{ display: "block", width: "100%", textAlign: "left", background: active ? "#cde" : "transparent" }}
              >
                {c.number}. {c.text}
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
    <div style={{ display: "flex", gap: "1rem" }}>
      <Section title="ჰორიზონტალურად" clues={across} direction="across" activeNumber={activeNumber} activeDirection={activeDirection} onSelect={onSelect} />
      <Section title="ვერტიკალურად" clues={down} direction="down" activeNumber={activeNumber} activeDirection={activeDirection} onSelect={onSelect} />
    </div>
  );
}
