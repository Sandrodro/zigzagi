import type { Scope } from "../engine/types";

type Item = { label: string; onClick: () => void };

// NYT-style menu: opens on hover (desktop) or focus-within (tap on mobile), pure CSS.
function Menu({ label, items }: { label: string; items: Item[] }) {
  return (
    <div className="group relative">
      <button
        type="button"
        className="px-4 py-2 text-sm hover:bg-paper group-hover:bg-paper group-focus-within:bg-paper"
      >
        {label}
      </button>
      <div className="absolute right-0 top-full z-30 hidden min-w-[10rem] border border-rule bg-white shadow-md group-hover:block group-focus-within:block">
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            onClick={it.onClick}
            className="block w-full border-t border-rule px-4 py-2.5 text-left text-sm first:border-t-0 hover:bg-paper"
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface PlayToolbarProps {
  onClear: (scope: Scope) => void;
  onReveal: (scope: Scope) => void;
  onCheck: (scope: Scope) => void;
}

export function PlayToolbar({ onClear, onReveal, onCheck }: PlayToolbarProps) {
  return (
    <div role="toolbar" aria-label="ხელსაწყოები" className="mb-4 flex justify-end border-b border-rule">
      <Menu
        label="გასუფთავება"
        items={[
          { label: "სიტყვა", onClick: () => onClear("word") },
          { label: "თავსატეხი", onClick: () => onClear("puzzle") },
        ]}
      />
      <Menu
        label="ჩვენება"
        items={[
          { label: "უჯრა", onClick: () => onReveal("square") },
          { label: "სიტყვა", onClick: () => onReveal("word") },
          { label: "თავსატეხი", onClick: () => onReveal("puzzle") },
        ]}
      />
      <Menu
        label="შემოწმება"
        items={[
          { label: "უჯრა", onClick: () => onCheck("square") },
          { label: "სიტყვა", onClick: () => onCheck("word") },
          { label: "თავსატეხი", onClick: () => onCheck("puzzle") },
        ]}
      />
    </div>
  );
}
