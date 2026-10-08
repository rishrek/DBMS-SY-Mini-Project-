// "History": one card, four tabs (temperature, humidity, rain, air quality), each
// with a Chart / Table switch, so no value is only readable through colour or hovering.
// Loaded lazily, so the rest of the dashboard appears before the charting library.
import { useState } from "react";
import { useApi } from "../lib/useApi";
import { fmtDayMonth, fmtReading } from "../lib/format";
import { Async, EmptyState } from "./States";
import DataTable from "./DataTable";
import { AqiChart, HumidityChart, RainChart, TemperatureChart } from "./charts";

const TABS = [
  { key: "temp", label: "Temperature", source: "hourly", note: "Every hour, last 7 days, in °C",
    Chart: TemperatureChart, columns: [{ key: "reading_at", label: "Time (IST)", render: (r) => fmtReading(r.reading_at) },
                                       { key: "temp", label: "°C", align: "right" }] },
  { key: "humidity", label: "Humidity", source: "hourly", note: "Every hour, last 7 days, in %",
    Chart: HumidityChart, columns: [{ key: "reading_at", label: "Time (IST)", render: (r) => fmtReading(r.reading_at) },
                                    { key: "humidity", label: "%", align: "right" }] },
  { key: "rain", label: "Rain", source: "daily", note: "Rain per day, last 30 days, in mm",
    Chart: RainChart, columns: [{ key: "reading_date", label: "Date", render: (r) => fmtDayMonth(r.reading_date) },
                                { key: "rain_mm", label: "mm", align: "right" },
                                { key: "rain_hours", label: "Rainy hours", align: "right" }] },
  { key: "aqi", label: "Air quality", source: "daily", note: "Daily average CPCB AQI, last 30 days, bands shaded",
    Chart: AqiChart, columns: [{ key: "reading_date", label: "Date", render: (r) => fmtDayMonth(r.reading_date) },
                               { key: "avg_aqi", label: "Average AQI", align: "right" },
                               { key: "max_aqi", label: "Worst hour", align: "right" }] },
];

function Segmented({ label, options, value, onChange }) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap rounded-xl bg-page p-1 text-sm">
      {options.map((o) => (
        <button key={o.key} type="button" role="tab" aria-selected={value === o.key} onClick={() => onChange(o.key)}
                className={`rounded-lg px-3 py-1.5 font-medium transition-colors ${
                  value === o.key ? "bg-surface text-ink shadow-card" : "text-ink-2 hover:text-ink"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function HistoryCharts({ regionId }) {
  const hourly = useApi(`/api/regions/${regionId}/hourly?days=7`, { auth: true, live: ["weather_data"] });
  const daily = useApi(`/api/regions/${regionId}/daily`, { auth: true, live: ["weather_data"] });
  const [tab, setTab] = useState("temp");
  const [view, setView] = useState("chart");
  const current = TABS.find((t) => t.key === tab);
  const state = current.source === "hourly" ? hourly : daily;

  return (
    <section id="history" aria-labelledby="history-heading" className="card scroll-mt-24 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="history-heading" className="font-semibold text-ink">History</h2>
          <p className="text-sm text-ink-2">{current.note}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Segmented label="Which history" options={TABS} value={tab} onChange={setTab} />
          <Segmented label="Show as" value={view} onChange={setView}
                     options={[{ key: "chart", label: "Chart" }, { key: "table", label: "Table" }]} />
        </div>
      </div>
      <div className="mt-4">
        <Async state={state} loadingLabel="Gathering the past days…" height="h-[260px]" isEmpty={(d) => d.length === 0}
               empty={<EmptyState title="No readings yet for this area" hint="The history fills in as readings arrive." />}>
          {(rows) => view === "chart"
            ? <div className="h-[260px] w-full"><current.Chart rows={rows} /></div>
            : <div className="max-h-72 overflow-auto"><DataTable dense columns={current.columns} rows={rows} /></div>}
        </Async>
      </div>
    </section>
  );
}
