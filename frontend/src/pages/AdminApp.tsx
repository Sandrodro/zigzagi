import { useState } from "react";

import { PageHeader } from "../components/ui/PageHeader";
import { PoolReview } from "./PoolReview";
import { PuzzleBuilder } from "./PuzzleBuilder";
import { WordlistManager } from "./WordlistManager";

type Tab = "pool" | "wordlist" | "build";

const TABS: { id: Tab; label: string }[] = [
  { id: "pool", label: "პული" },
  { id: "wordlist", label: "ლექსიკონი" },
  { id: "build", label: "აწყობა" },
];

export function AdminApp() {
  const [tab, setTab] = useState<Tab>("pool");
  return (
    <div className="page">
      <PageHeader title="რედაქცია" eyebrow="ადმინისტრირება" />
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className="tab" data-active={tab === t.id ? "true" : "false"} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "pool" && <PoolReview />}
      {tab === "wordlist" && <WordlistManager />}
      {tab === "build" && <PuzzleBuilder />}
    </div>
  );
}
