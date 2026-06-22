import type { ClueRef, Direction } from "../engine/types";

interface ClueBarProps {
  clue: ClueRef | null;
  direction: Direction;
  onPrev: () => void;
  onNext: () => void;
  onToggleDirection: () => void;
}

const dirLabel = (d: Direction) => (d === "across" ? "ჰორიზ." : "ვერტ.");

export function ClueBar({ clue, direction, onPrev, onNext, onToggleDirection }: ClueBarProps) {
  return (
    <div role="group" aria-label="clue bar" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <button aria-label="previous clue" onClick={onPrev}>‹</button>
      <button aria-label="toggle direction" onClick={onToggleDirection} style={{ fontWeight: 600 }}>
        {clue ? `${clue.number} ${dirLabel(direction)}` : ""}
      </button>
      <span style={{ flex: 1 }}>{clue?.text ?? ""}</span>
      <button aria-label="next clue" onClick={onNext}>›</button>
    </div>
  );
}
