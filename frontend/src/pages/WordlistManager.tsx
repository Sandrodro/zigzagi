import { useEffect, useState } from "react";

import {
  addWord,
  bulkImport,
  fetchWordlist,
  fetchWordlistStats,
  updateWord,
  type WordlistStats,
  type WordlistWord,
} from "../api/admin";
import { DataTable } from "../components/DataTable";
import { Button } from "../components/ui/Button";
import { Input, Textarea } from "../components/ui/Input";
import { SectionTitle } from "../components/ui/Typography";

const COLUMNS = [
  { key: "word", header: "სიტყვა" },
  { key: "length", header: "სიგრძე" },
  { key: "status", header: "სტატუსი" },
] as const;

export function WordlistManager() {
  const [words, setWords] = useState<WordlistWord[]>([]);
  const [stats, setStats] = useState<WordlistStats | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [newWord, setNewWord] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [imported, setImported] = useState<number | null>(null);

  const refresh = async () => {
    setWords(await fetchWordlist());
    setStats(await fetchWordlistStats());
    setSelected([]);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const onAdd = async () => {
    if (!newWord.trim()) return;
    await addWord(newWord.trim());
    setNewWord("");
    await refresh();
  };

  const setStatusFor = async (status: "active" | "blocked") => {
    if (selected.length === 0) return;
    await Promise.all(selected.map((id) => updateWord(id, { status })));
    await refresh();
  };

  const onImport = async () => {
    const res = await bulkImport(bulkText);
    setImported(res.added);
    setBulkText("");
    await refresh();
  };

  return (
    <section>
      <SectionTitle>ლექსიკონი</SectionTitle>
      {stats && (
        <p className="font-mono text-[0.85rem] text-ink-soft">
          აქტიური: {stats.active} · დაბლოკილი: {stats.blocked}
        </p>
      )}
      {stats && (
        <ul className="my-2 flex list-none flex-wrap gap-2 p-0" aria-label="length histogram">
          {Object.entries(stats.by_length).map(([len, count]) => (
            <li key={len} className="rounded border border-rule px-1.5 py-0.5 font-mono text-[0.78rem] text-ink-soft">
              {len}: {count}
            </li>
          ))}
        </ul>
      )}

      <div className="my-4 flex flex-wrap gap-2">
        <Input className="max-w-64" aria-label="new word" placeholder="სიტყვა" value={newWord} onChange={(e) => setNewWord(e.target.value)} />
        <Button variant="primary" size="sm" onClick={onAdd}>დამატება</Button>
      </div>

      <div className="my-2.5 flex flex-col gap-1.5">
        <label className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-ink-soft" htmlFor="wl-bulk">სიის იმპორტი</label>
        <Textarea id="wl-bulk" aria-label="bulk import" placeholder="ჩასვი სიტყვები" value={bulkText} onChange={(e) => setBulkText(e.target.value)} />
      </div>
      <Button size="sm" onClick={onImport}>იმპორტი</Button>
      {imported !== null && <p className="text-ink-soft">დაემატა: {imported}</p>}

      <div className="my-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-ink-soft">მონიშნული</span>
        <Button variant="danger" size="sm" onClick={() => setStatusFor("blocked")}>დაბლოკვა</Button>
        <Button size="sm" onClick={() => setStatusFor("active")}>განბლოკვა</Button>
      </div>
      <DataTable columns={[...COLUMNS]} rows={words} selectable onSelectionChange={setSelected} />
    </section>
  );
}
