import { useState } from "react";

import { PoolReview } from "./PoolReview";
import { PuzzleBuilder } from "./PuzzleBuilder";
import { WordlistManager } from "./WordlistManager";

type Tab = "pool" | "wordlist" | "build";

export function AdminApp() {
  const [tab, setTab] = useState<Tab>("pool");
  return (
    <div>
      <nav>
        <button onClick={() => setTab("pool")}>პული</button>
        <button onClick={() => setTab("wordlist")}>ლექსიკონი</button>
        <button onClick={() => setTab("build")}>აწყობა</button>
      </nav>
      {tab === "pool" && <PoolReview />}
      {tab === "wordlist" && <WordlistManager />}
      {tab === "build" && <PuzzleBuilder />}
    </div>
  );
}
