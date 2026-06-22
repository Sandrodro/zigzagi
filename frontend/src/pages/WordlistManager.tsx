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
        <p className="stat">
          აქტიური: {stats.active} · დაბლოკილი: {stats.blocked}
        </p>
      )}
      {stats && (
        <ul className="histogram" aria-label="length histogram">
          {Object.entries(stats.by_length).map(([len, count]) => (
            <li key={len}>
              {len}: {count}
            </li>
          ))}
        </ul>
      )}

      <div className="toolbar">
        <input className="input" style={{ maxWidth: "16rem" }} aria-label="new word" placeholder="სიტყვა" value={newWord} onChange={(e) => setNewWord(e.target.value)} />
        <Button variant="primary" size="sm" onClick={onAdd}>დამატება</Button>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="wl-bulk">სიის იმპორტი</label>
        <textarea id="wl-bulk" className="textarea" aria-label="bulk import" placeholder="ჩასვი სიტყვები" value={bulkText} onChange={(e) => setBulkText(e.target.value)} />
      </div>
      <Button size="sm" onClick={onImport}>იმპორტი</Button>
      {imported !== null && <p className="muted">დაემატა: {imported}</p>}

      <div className="toolbar">
        <span className="toolbar__label">მონიშნული</span>
        <Button variant="danger" size="sm" onClick={() => setStatusFor("blocked")}>დაბლოკვა</Button>
        <Button size="sm" onClick={() => setStatusFor("active")}>განბლოკვა</Button>
      </div>
      <DataTable columns={[...COLUMNS]} rows={words} selectable onSelectionChange={setSelected} />
    </section>
  );
}
