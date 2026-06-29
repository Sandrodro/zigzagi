import type { ClueRef, Direction } from "../engine/types";

interface ClueBarProps {
  clue: ClueRef | null;
  direction: Direction;
  onPrev: () => void;
  onNext: () => void;
  onToggleDirection: () => void;
}

export function ClueBar({ clue }: ClueBarProps) {
  return (
    <div role="group" aria-label="clue bar" className="mb-4 rounded bg-teal px-3 py-2 text-sm text-white">
      {clue ? clue.text : ""}
    </div>
  );
}
