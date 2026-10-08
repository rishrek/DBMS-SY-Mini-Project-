// A plain, scrollable table. `columns` is a list of names or {key, label, render, align}.
export default function DataTable({ columns, rows, caption, rowKey, actions, dense = false }) {
  const cols = columns.map((c) => (typeof c === "string" ? { key: c, label: c } : c));
  const pad = dense ? "px-2 py-1" : "px-3 py-2";
  return (
    // "relative" makes absolutely positioned content (e.g. screen-reader text) scroll
    // inside this box instead of widening the whole page on phones.
    <div className="relative overflow-x-auto rounded-xl border border-line bg-surface">
      <table className="w-full min-w-max border-collapse text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-line bg-page/60 text-left">
            {cols.map((c) => (
              <th key={c.key} scope="col"
                  className={`${pad} text-xs font-semibold text-ink-2 ${c.align === "right" ? "text-right" : ""}`}>
                {c.label ?? c.key}
              </th>
            ))}
            {actions && <th className={`${pad} text-xs font-semibold text-ink-2`}><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey ? rowKey(row) : i} className="border-b border-line last:border-0 hover:bg-page/50">
              {cols.map((c) => (
                <td key={c.key} className={`${pad} align-top ${c.align === "right" ? "tabular text-right" : ""}`}>
                  {c.render ? c.render(row) : formatCell(row[c.key])}
                </td>
              ))}
              {actions && <td className={`${pad} whitespace-nowrap text-right`}>{actions(row)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(value) {
  if (value === null || value === undefined) return <span className="text-muted">NULL</span>;
  if (typeof value === "number") return <span className="tabular">{value.toLocaleString("en-IN")}</span>;
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}
