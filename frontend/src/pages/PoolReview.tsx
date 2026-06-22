import { useState } from "react";

import { bulkUpdate, extractText, type Candidate } from "../api/admin";
import { DataTable } from "../components/DataTable";
import { Button } from "../components/ui/Button";
import { Input, Textarea } from "../components/ui/Input";
import { SectionTitle } from "../components/ui/Typography";

const LABEL = "text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-ink-soft";

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
    <section>
      <SectionTitle>წყაროდან ამოღება</SectionTitle>
      <div className="my-2.5 flex flex-col gap-1.5">
        <label className={LABEL} htmlFor="pool-theme">თემა</label>
        <Input id="pool-theme" aria-label="theme" placeholder="თემა" value={theme} onChange={(e) => setTheme(e.target.value)} />
      </div>
      <div className="my-2.5 flex flex-col gap-1.5">
        <label className={LABEL} htmlFor="pool-text">ტექსტი</label>
        <Textarea id="pool-text" aria-label="source text" placeholder="ჩასვი ტექსტი" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <Button variant="primary" onClick={onExtract}>ამოღება</Button>

      {candidates.length > 0 && (
        <>
          <p className="text-ink-soft">ამოვარდა: {dropped}</p>
          <div className="my-4 flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={() => apply("accept")}>მონიშნულის მიღება</Button>
            <Button variant="danger" size="sm" onClick={() => apply("reject")}>მონიშნულის უარყოფა</Button>
          </div>
          <DataTable columns={[...COLUMNS]} rows={candidates} selectable onSelectionChange={setSelected} />
        </>
      )}
    </section>
  );
}
