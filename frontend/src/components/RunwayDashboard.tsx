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
      <p className="eyebrow">დაფარვა</p>
      <p className="timer" style={{ fontSize: "1.4rem" }}>{runway.runway_days} დღე</p>
      {runway.warning && (
        <p role="alert" className="banner banner--warn">
          გაფრთხილება: დაფარვა 7 დღეზე ნაკლებია
        </p>
      )}
    </div>
  );
}
