import { useState } from "react";
import { Button } from "../components/ui/Button";
import { Textarea } from "../components/ui/Input";
import { SectionTitle } from "../components/ui/Typography";
import { articleLemmas, bulkImportLemmas } from "../api/admin";

interface Row {
  word: string;
  added: boolean; // already in pool, or added this session
}

export function FromArticle() {
  const [text, setText] = useState("");
  const [cheap, setCheap] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function process() {
    setBusy(true);
    setMsg(null);
    try {
      const lemmas = await articleLemmas(text, cheap);
      setRows(lemmas.map((l) => ({ word: l.word, added: l.already_added })));
      if (lemmas.length === 0) setMsg("ლემები ვერ მოიძებნა");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }

  async function add(words: string[]) {
    if (words.length === 0) return;
    await bulkImportLemmas(words);
    setRows((rs) => rs.map((r) => (words.includes(r.word) ? { ...r, added: true } : r)));
  }

  const remove = (word: string) => setRows((rs) => rs.filter((r) => r.word !== word));
  const pending = rows.filter((r) => !r.added).map((r) => r.word);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <SectionTitle>სტატიიდან ლემები</SectionTitle>
        <Textarea
          aria-label="სტატია"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="ჩასვი ქართული ტექსტი..."
          className="min-h-[10rem]"
        />
        <div className="flex items-center gap-2">
          <Button variant="primary" onClick={process} disabled={busy || !text.trim()}>
            {busy ? "მუშავდება..." : "დამუშავება"}
          </Button>
          {rows.length > 0 && (
            <Button onClick={() => add(pending)} disabled={pending.length === 0}>
              ყველას დამატება ({pending.length})
            </Button>
          )}
          <label className="ml-auto flex items-center gap-1.5 text-sm text-ink-soft">
            <input type="checkbox" checked={cheap} onChange={(e) => setCheap(e.target.checked)} />
            იაფი მოდელი (flash)
          </label>
        </div>
        {msg && <p className="text-sm text-ink-soft">{msg}</p>}
      </div>

      {rows.length > 0 && (
        <ul className="flex flex-col gap-1">
          {rows.map((r) => (
            <li key={r.word} className="flex items-center justify-between border-b border-rule py-1.5">
              <span className={r.added ? "text-ink-soft line-through" : "text-ink"}>{r.word}</span>
              <div className="flex gap-2">
                {r.added ? (
                  <span className="self-center text-xs text-ink-soft">დამატებულია</span>
                ) : (
                  <Button size="sm" onClick={() => add([r.word])}>დამატება</Button>
                )}
                <Button size="sm" variant="danger" onClick={() => remove(r.word)}>წაშლა</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
