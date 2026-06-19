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

  return (
    <table>
      <thead>
        <tr>
          {selectable && <th />}
          {columns.map((c) => (
            <th key={c.key}>{c.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            {selectable && (
              <td>
                <input
                  type="checkbox"
                  data-testid={`select-${row.id}`}
                  checked={selected.includes(row.id)}
                  onChange={() => toggle(row.id)}
                />
              </td>
            )}
            {columns.map((c) => (
              <td key={c.key}>{String(row[c.key])}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
