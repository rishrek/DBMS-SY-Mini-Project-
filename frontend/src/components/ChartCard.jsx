// A card for one chart, with a Chart / Table switch: every chart also has a
// table view, so no value is only readable through colour or hovering.
import { useState } from "react";
import DataTable from "./DataTable";

export default function ChartCard({ title, subtitle, table, children, height = 240 }) {
  const [view, setView] = useState("chart");
  return (
    <section className="min-w-0 rounded-2xl border border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-ink">{title}</h3>
          {subtitle && <p className="text-xs text-ink-2">{subtitle}</p>}
        </div>
        {table && (
          <div role="tablist" aria-label={`${title}: view`} className="flex rounded-lg border border-line p-0.5 text-xs">
            {["chart", "table"].map((v) => (
              <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
                      className={`rounded-md px-2.5 py-1 font-medium capitalize ${view === v ? "bg-navy text-white" : "text-ink-2 hover:text-ink"}`}>
                {v}
              </button>
            ))}
          </div>
        )}
      </div>
      {view === "chart" || !table ? (
        <div style={{ height }} className="w-full">{children}</div>
      ) : (
        <div className="max-h-72 overflow-auto"><DataTable dense columns={table.columns} rows={table.rows} /></div>
      )}
    </section>
  );
}
