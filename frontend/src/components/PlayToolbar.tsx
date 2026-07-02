import { useState, type ReactNode } from "react";
import type { Scope } from "../engine/types";

type Item = { label: string; onClick: () => void };

// NYT-style menu: opens on click, closes on outside click / item pick. Desktop only (see IconMenu for mobile).
function Menu({ label, items }: { label: string; items: Item[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="relative"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer px-4 py-2 text-sm hover:bg-paper"
      >
        {label}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 min-w-[10rem] border border-rule bg-white shadow-md">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              onClick={() => { it.onClick(); setOpen(false); }}
              className="block w-full cursor-pointer border-t border-rule px-4 py-2.5 text-left text-sm first:border-t-0 hover:bg-paper"
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// lucide-style icon strokes (no dep — matches ClueBar's chevron convention).
const iconClass = "h-5 w-5 stroke-current [stroke-width:2] [stroke-linecap:round] [stroke-linejoin:round]";
const EraserIcon = () => (
  <svg className={iconClass} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l9.6-9.6a2 2 0 0 1 2.8 0l5.6 5.6a2 2 0 0 1 0 2.8L13 21" />
    <path d="M22 21H7" />
    <path d="m5 11 9 9" />
  </svg>
);
const EyeIcon = () => (
  <svg className={iconClass} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const CheckIcon = () => (
  <svg className={iconClass} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

// Mobile: an icon button opens a small options modal over a dimming overlay (the grid stays visible underneath).
function IconMenu({ label, icon, items }: { label: string; icon: ReactNode; items: Item[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" aria-label={label} onClick={() => setOpen(true)} className="cursor-pointer p-2">
        {icon}
      </button>
      {open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className="min-w-[12rem] rounded border border-rule bg-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                onClick={() => { it.onClick(); setOpen(false); }}
                className="block w-full cursor-pointer border-t border-rule px-4 py-2.5 text-left text-sm first:border-t-0 hover:bg-paper"
              >
                {it.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

interface PlayToolbarProps {
  onClear: (scope: Scope) => void;
  onReveal: (scope: Scope) => void;
  onCheck: (scope: Scope) => void;
}

export function PlayToolbar({ onClear, onReveal, onCheck }: PlayToolbarProps) {
  const clearItems: Item[] = [
    { label: "სიტყვის გასუფთავება", onClick: () => onClear("word") },
    { label: "თავსატეხის გასუფთავება", onClick: () => onClear("puzzle") },
  ];
  const revealItems: Item[] = [
    { label: "უჯრის ჩვენება", onClick: () => onReveal("square") },
    { label: "სიტყვის ჩვენება", onClick: () => onReveal("word") },
    { label: "თავსატეხის ჩვენება", onClick: () => onReveal("puzzle") },
  ];
  const checkItems: Item[] = [
    { label: "უჯრის შემოწმება", onClick: () => onCheck("square") },
    { label: "სიტყვის შემოწმება", onClick: () => onCheck("word") },
    { label: "თავსატეხის შემოწმება", onClick: () => onCheck("puzzle") },
  ];

  return (
    <div role="toolbar" aria-label="ხელსაწყოები" className="mb-4 flex justify-end border-b border-rule">
      <div className="hidden md:flex">
        <Menu label="გასუფთავება" items={clearItems} />
        <Menu label="ჩვენება" items={revealItems} />
        <Menu label="შემოწმება" items={checkItems} />
      </div>
      <div className="flex md:hidden">
        <IconMenu label="გასუფთავება" icon={<EraserIcon />} items={clearItems} />
        <IconMenu label="ჩვენება" icon={<EyeIcon />} items={revealItems} />
        <IconMenu label="შემოწმება" icon={<CheckIcon />} items={checkItems} />
      </div>
    </div>
  );
}
