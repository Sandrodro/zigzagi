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
    <div>
      <h2>ლექსიკონი</h2>
      {stats && (
        <p>
          აქტიური: {stats.active} | დაბლოკილი: {stats.blocked}
        </p>
      )}
      {stats && (
        <ul aria-label="length histogram">
          {Object.entries(stats.by_length).map(([len, count]) => (
            <li key={len}>
              {len}: {count}
            </li>
          ))}
        </ul>
      )}

      <input
        aria-label="new word"
        placeholder="სიტყვა"
        value={newWord}
        onChange={(e) => setNewWord(e.target.value)}
      />
      <button onClick={onAdd}>დამატება</button>

      <textarea
        aria-label="bulk import"
        placeholder="ჩასვი სიტყვები"
        value={bulkText}
        onChange={(e) => setBulkText(e.target.value)}
      />
      <button onClick={onImport}>იმპორტი</button>
      {imported !== null && <p>დაემატა: {imported}</p>}

      <button onClick={() => setStatusFor("blocked")}>დაბლოკვა</button>
      <button onClick={() => setStatusFor("active")}>განბლოკვა</button>
      <DataTable columns={[...COLUMNS]} rows={words} selectable onSelectionChange={setSelected} />
    </div>
  );
}
