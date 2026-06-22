import type { ClueRef, Direction } from "../engine/types";
import { Button } from "./ui/Button";

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
    <div role="group" aria-label="clue bar" className="cluebar">
      <Button variant="quiet" size="sm" aria-label="previous clue" onClick={onPrev}>
        ‹
      </Button>
      <button className="cluebar__ref" aria-label="toggle direction" onClick={onToggleDirection}>
        {clue ? `${clue.number} · ${dirLabel(direction)}` : ""}
      </button>
      <span className="cluebar__text">{clue?.text ?? ""}</span>
      <Button variant="quiet" size="sm" aria-label="next clue" onClick={onNext}>
        ›
      </Button>
    </div>
  );
}
