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
    <div role="group" aria-label="clue bar" className="mb-4 flex items-center gap-2.5 rounded border border-rule bg-paper-raised px-2 py-1.5">
      <Button variant="quiet" size="sm" aria-label="previous clue" onClick={onPrev}>
        ‹
      </Button>
      <button className="cursor-pointer whitespace-nowrap font-serif font-semibold text-teal-deep" aria-label="toggle direction" onClick={onToggleDirection}>
        {clue ? `${clue.number} · ${dirLabel(direction)}` : ""}
      </button>
      <span className="min-w-0 flex-1">{clue?.text ?? ""}</span>
      <Button variant="quiet" size="sm" aria-label="next clue" onClick={onNext}>
        ›
      </Button>
    </div>
  );
}
