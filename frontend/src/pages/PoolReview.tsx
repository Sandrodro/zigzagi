import { useState } from "react";

import { bulkUpdate, extractText, type Candidate } from "../api/admin";
import { DataTable } from "../components/DataTable";

const COLUMNS = [
  { key: "surface", header: "სიტყვა" },
  { key: "length", header: "სიგრძე" },
  { key: "snippet", header: "კონტექსტი" },
] as const;

export function PoolReview() {
  const [text, setText] = useState("");
  const [theme, setTheme] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [dropped, setDropped] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);

  const onExtract = async () => {
    const res = await extractText(text, theme);
    setCandidates(res.candidates);
    setDropped(res.dropped_count);
    setSelected([]);
  };

  const apply = async (action: "accept" | "reject") => {
    if (selected.length === 0) return;
    await bulkUpdate(selected.map((id) => ({ id, action })));
    setCandidates((cs) => cs.filter((c) => !selected.includes(c.id)));
    setSelected([]);
  };

  return (
    <div>
      <input
        aria-label="theme"
        placeholder="თემა"
        value={theme}
        onChange={(e) => setTheme(e.target.value)}
      />
      <textarea
        aria-label="source text"
        placeholder="ჩასვი ტექსტი"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button onClick={onExtract}>ამოღება</button>

      {candidates.length > 0 && (
        <>
          <p>ამოვარდა: {dropped}</p>
          <button onClick={() => apply("accept")}>მონიშნულის მიღება</button>
          <button onClick={() => apply("reject")}>მონიშნულის უარყოფა</button>
          <DataTable columns={[...COLUMNS]} rows={candidates} selectable onSelectionChange={setSelected} />
        </>
      )}
    </div>
  );
}
