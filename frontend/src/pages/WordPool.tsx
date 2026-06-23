import { useState } from "react";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { SectionTitle } from "../components/ui/Typography";
import { addPoolWord } from "../api/admin";
import { PoolReview } from "./PoolReview";

export function WordPool() {
  const [surface, setSurface] = useState("");
  const [theme, setTheme] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function add() {
    setMsg(null);
    try {
      const r = await addPoolWord(surface.trim(), theme.trim());
      setMsg(`დაემატა: ${r.surface}`);
      setSurface("");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "error");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <SectionTitle>სიტყვის დამატება</SectionTitle>
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-sm"><span>ახალი სიტყვა</span>
            <Input aria-label="ახალი სიტყვა" value={surface} onChange={(e) => setSurface(e.target.value)} /></label>
          <label className="flex flex-col gap-1 text-sm"><span>თემა (პული)</span>
            <Input aria-label="თემა (პული)" value={theme} onChange={(e) => setTheme(e.target.value)} /></label>
          <Button onClick={add} disabled={!surface.trim() || !theme.trim()}>დამატება</Button>
        </div>
        {msg && <p className="text-sm text-ink-soft">{msg}</p>}
      </div>
      <PoolReview />
    </div>
  );
}
