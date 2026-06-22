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
    <div className="mx-auto max-w-[760px] px-5 pt-8 pb-16">
      <PageHeader title="რედაქცია" eyebrow="ადმინისტრირება" />
      <nav className="mb-6 flex gap-1 border-b border-rule">
        {TABS.map((t) => (
          <button
            key={t.id}
            className="cursor-pointer border-0 border-b-2 border-transparent px-3 py-2 text-sm text-ink-soft hover:text-ink data-[active=true]:border-b-ochre data-[active=true]:text-ink"
            data-active={tab === t.id ? "true" : "false"}
            onClick={() => setTab(t.id)}
          >
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
