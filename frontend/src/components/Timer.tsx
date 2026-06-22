export function Timer({ seconds }: { seconds: number }) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  return (
    <span role="timer" className="font-mono text-[1.05rem] tracking-[0.04em] tabular-nums">
      {mm}:{ss}
    </span>
  );
}
