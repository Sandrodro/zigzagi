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
      <p>{runway.runway_days} დღე</p>
      {runway.warning && <p role="alert">გაფრთხილება: დაფარვა 7 დღეზე ნაკლებია</p>}
    </div>
  );
}
