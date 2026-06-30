import type { ClueRef, Direction } from "../engine/types";

interface ClueBarProps {
  clue: ClueRef | null;
  direction: Direction;
  onPrev: () => void;
  onNext: () => void;
  onToggleDirection: () => void;
}

// lucide-style chevrons (no dep — two inline paths in lucide's stroke convention).
const chevron = "h-6 w-6 stroke-current [stroke-width:2] [stroke-linecap:round] [stroke-linejoin:round]";
const ChevronLeft = () => (
  <svg className={chevron} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
);
const ChevronRight = () => (
  <svg className={chevron} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
);

export function ClueBar({ clue, direction, onPrev, onNext, onToggleDirection }: ClueBarProps) {
  return (
    <div role="group" aria-label="clue bar" className="flex h-14 items-stretch rounded bg-teal text-white">
      <button type="button" aria-label="წინა" onClick={onPrev} className="flex items-center px-2">
        <ChevronLeft />
      </button>
      {/* Fixed height + 2-line clamp: switching clues never changes the bar height (so the grid stays put). */}
      <button type="button" onClick={onToggleDirection} className="flex flex-1 items-center px-2 text-left text-sm">
        {/* key on clue identity: text cross-fades in when the clue changes (newdesign cluebar-in). */}
        <span
          key={`${clue?.number}-${direction}`}
          className="line-clamp-2"
          style={{ animation: "krosi-cluebar-in var(--dur-base) var(--ease-out)" }}
        >
          {clue ? clue.text : ""}
        </span>
      </button>
      <button type="button" aria-label="შემდეგი" onClick={onNext} className="flex items-center px-2">
        <ChevronRight />
      </button>
    </div>
  );
}
