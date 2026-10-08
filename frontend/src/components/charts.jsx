// Dashboard charts (Recharts). Rules followed: one y-axis per chart (never two),
// thin marks (2px lines, bars at most 24px wide with 4px rounded tops), solid
// hairline grid, a tooltip on hover, and a table view in each ChartCard.
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceArea, ReferenceDot, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AQI_BANDS, AQI_STYLE, CHROME, LEVELS, SERIES } from "../lib/colors";
import { fmtDayMonth, fmtReading, num } from "../lib/format";

const tick = { fill: CHROME.axis, fontSize: 12 };
const xAxisProps = { tick, tickLine: false, axisLine: { stroke: CHROME.baseline } };
const yAxisProps = { tick, tickLine: false, axisLine: false, width: 44 };
const grid = <CartesianGrid vertical={false} stroke={CHROME.grid} />;

// Tooltip: text in ink colours, identity shown by a small coloured dot.
export function ChartTooltip({ active, payload, label, labelFormatter = (l) => l, digits = 1 }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-medium text-ink">{labelFormatter(label)}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-ink-2">
          <span className="inline-block size-2 rounded-full" style={{ background: p.color ?? p.payload?.fill }} />
          {p.name}: <span className="tabular font-semibold text-ink">{num(p.value, digits)}{p.unit ?? ""}</span>
        </p>
      ))}
    </div>
  );
}

// Ticks at midnight only: one label per day on the hourly charts.
const midnights = (rows) => rows.filter((r) => r.reading_at.endsWith("T00:00:00")).map((r) => r.reading_at);
const ist = (label) => `${fmtReading(label)} IST`;

// A soft area under the temperature line, and a dot on the newest hour.
export function TemperatureChart({ rows }) {
  const last = rows.at(-1);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={rows} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIES.temp} stopOpacity={0.22} />
            <stop offset="100%" stopColor={SERIES.temp} stopOpacity={0} />
          </linearGradient>
        </defs>
        {grid}
        <XAxis dataKey="reading_at" ticks={midnights(rows)} tickFormatter={fmtDayMonth} {...xAxisProps} />
        <YAxis {...yAxisProps} unit="°" domain={[(min) => Math.floor(min - 1), (max) => Math.ceil(max + 1)]} />
        <Tooltip content={<ChartTooltip labelFormatter={ist} />} cursor={{ stroke: CHROME.baseline }} />
        <Area type="monotone" dataKey="temp" name="Temperature" unit=" °C" stroke={SERIES.temp} strokeWidth={2}
              fill="url(#tempFill)" dot={false} activeDot={{ r: 4, stroke: CHROME.surface, strokeWidth: 2 }}
              isAnimationActive={false} />
        {last && <ReferenceDot x={last.reading_at} y={last.temp} r={5} fill={SERIES.temp} stroke={CHROME.surface} strokeWidth={2} />}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function HumidityChart({ rows }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        {grid}
        <XAxis dataKey="reading_at" ticks={midnights(rows)} tickFormatter={fmtDayMonth} {...xAxisProps} />
        <YAxis {...yAxisProps} unit="%" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} />
        <Tooltip content={<ChartTooltip labelFormatter={ist} digits={0} />} cursor={{ stroke: CHROME.baseline }} />
        <Line type="monotone" dataKey="humidity" name="Humidity" unit=" %" stroke={SERIES.humid} strokeWidth={2}
              dot={false} activeDot={{ r: 4, stroke: CHROME.surface, strokeWidth: 2 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function RainChart({ rows }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 16, right: 12, bottom: 0, left: 0 }}>
        {grid}
        <XAxis dataKey="reading_date" tickFormatter={fmtDayMonth} minTickGap={24} {...xAxisProps} />
        <YAxis {...yAxisProps} unit=" mm" width={56} />
        <Tooltip content={<ChartTooltip labelFormatter={fmtDayMonth} />} cursor={{ fill: "rgba(11,11,11,0.04)" }} />
        {/* The Yellow threshold, drawn only when the bars reach that high. */}
        <ReferenceLine y={64.5} stroke={LEVELS.Yellow.color} strokeWidth={1.5} ifOverflow="discard"
                       label={{ value: "Heavy rain 64.5 mm: Yellow", position: "insideTopRight", fill: CHROME.axis, fontSize: 11 }} />
        <Bar dataKey="rain_mm" name="Rainfall" unit=" mm" fill={SERIES.rain} maxBarSize={24} radius={[4, 4, 0, 0]}
             isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function AqiChart({ rows }) {
  const top = Math.max(100, Math.ceil((Math.max(...rows.map((r) => r.max_aqi ?? 0)) + 10) / 50) * 50);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        {/* CPCB bands as a faint background, each labelled with its name. */}
        {AQI_BANDS.filter((b) => b.min < top).map((b) => (
          <ReferenceArea key={b.category} y1={b.min} y2={Math.min(b.max, top)} fill={AQI_STYLE[b.category].bg}
                         fillOpacity={0.12} ifOverflow="discard"
                         label={{ value: b.category, position: "insideRight", fill: CHROME.axis, fontSize: 11 }} />
        ))}
        {grid}
        <XAxis dataKey="reading_date" tickFormatter={fmtDayMonth} minTickGap={24} {...xAxisProps} />
        <YAxis {...yAxisProps} domain={[0, top]} />
        <Tooltip content={<ChartTooltip labelFormatter={fmtDayMonth} digits={0} />} cursor={{ stroke: CHROME.baseline }} />
        <Line type="monotone" dataKey="avg_aqi" name="Average AQI" stroke={SERIES.aqi} strokeWidth={2}
              dot={false} activeDot={{ r: 4, stroke: CHROME.surface, strokeWidth: 2 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
