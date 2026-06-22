import { useState } from "react";

export interface Column<T> {
  key: keyof T & string;
  header: string;
}

interface DataTableProps<T extends { id: string }> {
  columns: Column<T>[];
  rows: T[];
  selectable?: boolean;
  onSelectionChange?: (ids: string[]) => void;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  selectable = false,
  onSelectionChange,
}: DataTableProps<T>) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) => {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    setSelected(next);
    onSelectionChange?.(next);
  };

  const th = "border-b border-rule-strong px-2 py-1.5 text-left text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-soft";
  const td = "border-b border-rule px-2 py-1.5";

  return (
    <table className="mt-4 w-full border-collapse text-[0.88rem]">
      <thead>
        <tr>
          {selectable && <th className={th} />}
          {columns.map((c) => (
            <th key={c.key} className={th}>{c.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="hover:bg-teal-faint">
            {selectable && (
              <td className={td}>
                <input
                  type="checkbox"
                  data-testid={`select-${row.id}`}
                  checked={selected.includes(row.id)}
                  onChange={() => toggle(row.id)}
                />
              </td>
            )}
            {columns.map((c) => (
              <td key={c.key} className={td}>{String(row[c.key])}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
