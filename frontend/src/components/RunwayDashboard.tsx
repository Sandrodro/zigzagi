import { useEffect, useState } from "react";

import { fetchRunway, type Runway } from "../api/admin";

export function RunwayDashboard() {
  const [runway, setRunway] = useState<Runway | null>(null);

  useEffect(() => {
    fetchRunway().then(setRunway);
  }, []);

  if (!runway) return null;

  return (
    <div>
      <p className="m-0 mb-1 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-ink-soft">დაფარვა</p>
      <p className="font-mono text-[1.4rem] tabular-nums">{runway.runway_days} დღე</p>
      {runway.warning && (
        <p role="alert" className="rounded border border-rule border-l-[3px] border-l-cinnabar bg-[#f8efef] px-3 py-1.5">
          გაფრთხილება: დაფარვა 7 დღეზე ნაკლებია
        </p>
      )}
    </div>
  );
}
