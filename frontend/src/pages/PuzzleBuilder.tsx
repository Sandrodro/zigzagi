import { Link } from "@tanstack/react-router";
import { useEffect, useReducer, useRef, useState } from "react";
import { Button } from "../components/ui/Button";
import { PuzzleEntries } from "../components/PuzzleEntries";
import { Grid } from "../components/Grid";
import { CrosswordEngine } from "../engine/crossword";
import { slotKey, templateToPuzzleData } from "../engine/puzzleData";
import {
  createPuzzle, fetchPuzzle, fetchTemplates, pollJob, requestFill,
  type PuzzleDetail, type TemplateDto,
} from "../api/admin";

export function PuzzleBuilder() {
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [wordpool, setWordpool] = useState("default");
  const [engine, setEngine] = useState<CrosswordEngine | null>(null);
  // ponytail: mutable engine; counter forces a re-render after each mutation.
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [puzzleId, setPuzzleId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PuzzleDetail | null>(null);

  useEffect(() => { fetchTemplates().then(setTemplates).catch(() => setError("failed to load templates")); }, []);
  const template = templates.find((t) => t.id === templateId);

  // Build a fresh editable engine whenever the selected template changes.
  useEffect(() => {
    if (!template) { setEngine(null); return; }
    setEngine(new CrosswordEngine(templateToPuzzleData(template)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  const focusInput = () => inputRef.current?.focus();

  const onInput = (ev: React.FormEvent<HTMLInputElement>) => {
    const ch = ev.currentTarget.value.slice(-1);
    ev.currentTarget.value = "";
    if (ch && engine) { engine.type(ch); rerender(); }
  };

  const onKeyDown = (ev: React.KeyboardEvent<HTMLInputElement>) => {
    if (!engine) return;
    if (ev.key === "Backspace") engine.backspace();
    else if (ev.key === "ArrowUp") engine.move("up");
    else if (ev.key === "ArrowDown") engine.move("down");
    else if (ev.key === "ArrowLeft") engine.move("left");
    else if (ev.key === "ArrowRight") engine.move("right");
    else if (ev.key === "Enter") engine.toggleDirection();
    else return;
    ev.preventDefault();
    rerender();
  };

  async function generate() {
    if (!template || !engine) return;
    setError(null); setDetail(null); setStatus("creating");
    try {
      // Derive prefilled from the editable grid: for each slot, walk its cells;
      // only fully-filled slots contribute (partial slots are skipped).
      const prefilled: Record<string, string> = {};
      for (const s of template.slots) {
        const letters: string[] = [];
        for (let i = 0; i < s.length; i++) {
          const r = s.direction === "down" ? s.row + i : s.row;
          const c = s.direction === "across" ? s.col + i : s.col;
          letters.push(engine.getValue(r, c));
        }
        if (letters.every((l) => l !== "")) prefilled[slotKey(s)] = letters.join("");
      }

      const p = await createPuzzle();
      setPuzzleId(p.id);
      // Random seed per generation so the same template yields a different fill each time
      // (identical seed_value is byte-identical by design).
      const seedValue = Math.floor(Math.random() * 1_000_000);
      const { job_id } = await requestFill(p.id, { templateId, prefilled, minSeeds: 0, wordpool, seedValue });
      setStatus("filling");
      for (;;) {
        const job = await pollJob(job_id);
        if (job.status === "done") break;
        if (job.status === "failed") { setError(job.error ?? "fill failed"); setStatus(null); return; }
        await new Promise((r) => setTimeout(r, 1000));
      }
      setDetail(await fetchPuzzle(p.id));
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "error"); setStatus(null);
    }
  }

  async function generateFreeform() {
    setError(null); setDetail(null); setStatus("creating");
    try {
      const p = await createPuzzle();
      setPuzzleId(p.id);
      const seedValue = Math.floor(Math.random() * 1_000_000);
      const { job_id } = await requestFill(p.id, {
        mode: "freeform", wordCount: 28, wordpool, seedValue,
      });
      setStatus("filling");
      for (;;) {
        const job = await pollJob(job_id);
        if (job.status === "done") break;
        if (job.status === "failed") { setError(job.error ?? "freeform failed"); setStatus(null); return; }
        await new Promise((r) => setTimeout(r, 1000));
      }
      setDetail(await fetchPuzzle(p.id));
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "error"); setStatus(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 text-sm">
        <span>შაბლონი</span>
        <div className="flex flex-wrap gap-3">
          {templates.map((t) => {
            const selected = t.id === templateId;
            const preview = new CrosswordEngine(templateToPuzzleData(t));
            return (
              <button
                key={t.id}
                type="button"
                aria-label={t.id}
                aria-pressed={selected}
                onClick={() => setTemplateId(t.id)}
                className={
                  "flex w-28 flex-col items-center gap-1 rounded p-1 " +
                  (selected
                    ? "ring-2 ring-ochre bg-ochre-tint"
                    : "ring-1 ring-rule hover:ring-rule-strong")
                }
              >
                <div className="pointer-events-none w-full">
                  <Grid engine={preview} onCellClick={() => {}} />
                </div>
                <span className="text-ink-soft text-xs">{t.id}</span>
              </button>
            );
          })}
        </div>
      </div>

      {engine && (
        <>
          <Grid
            engine={engine}
            onCellClick={(row, col) => {
              if (engine.active.row === row && engine.active.col === col) engine.toggleDirection();
              else engine.setActive(row, col);
              focusInput();
              rerender();
            }}
          />
          <input
            ref={inputRef}
            aria-label="cell input"
            defaultValue=""
            inputMode="text"
            autoCapitalize="none"
            autoCorrect="off"
            onInput={onInput}
            onKeyDown={onKeyDown}
            style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
          />
        </>
      )}

      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span>ლექსიკონი</span>
          <select aria-label="ლექსიკონი" value={wordpool} onChange={(e) => setWordpool(e.target.value)}>
            <option value="default">ზოგადი (wordpool_generic)</option>
            <option value="lemmas">ლემები (wordpool_lemmas)</option>
          </select>
        </label>
        <Button onClick={generate} disabled={!templateId || status === "filling" || status === "creating"}>
          გენერაცია
        </Button>
        <Button onClick={generateFreeform} disabled={status === "filling" || status === "creating"}>
          თავისუფალი ფორმა
        </Button>
      </div>

      {status && status !== "done" && <p className="text-sm text-ink-soft">{status}…</p>}
      {error && <p className="text-sm text-cinnabar">{error}</p>}

      {detail && (
        <>
          <PuzzleEntries
            detail={detail}
            reload={() => fetchPuzzle(detail.id).then(setDetail)}
          />
          {puzzleId && (
            <Link to="/admin/puzzles/$puzzleId" params={{ puzzleId }} className="text-ochre underline">
              სიაში ნახვა →
            </Link>
          )}
        </>
      )}
    </div>
  );
}
