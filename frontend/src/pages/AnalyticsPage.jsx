// Analytics for the DBMS demo: five queries, each shown with the EXACT SQL the
// backend ran (it sends the SQL along with the result).
import { useState } from "react";
import { Link } from "react-router";
import {
  Bar, BarChart, CartesianGrid, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useAuth } from "../auth/AuthContext";
import { useApi } from "../lib/useApi";
import { query } from "../lib/api";
import { CHROME, SERIES } from "../lib/colors";
import { fmtDate, fmtDayMonth, num } from "../lib/format";
import { Async, EmptyState } from "../components/States";
import { LevelChip, SourceTag } from "../components/Badges";
import SqlBlock from "../components/SqlBlock";
import DataTable from "../components/DataTable";
import ChartCard from "../components/ChartCard";
import { ChartTooltip } from "../components/charts";

const selectClass = "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm";

function Control({ label, children, hint }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">
      {label}
      {children}
      {hint && <span className="font-normal">{hint}</span>}
    </label>
  );
}

// One card = one SQL feature: its controls, its answer, and its SQL side by side.
function QueryCard({ number, feature, state, controls, isEmpty, empty, children }) {
  const data = state.data;
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-rain">Query {number} · {feature}</p>
      <h2 className="mt-1 text-lg font-semibold">{data?.title ?? "…"}</h2>
      {data?.description && <p className="text-sm text-ink-2">{data.description}</p>}
      {controls && <div className="mt-3 flex flex-wrap items-end gap-4">{controls}</div>}
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="min-w-0">
          <Async state={state} loadingLabel="Running the query…" isEmpty={(d) => isEmpty?.(d) ?? d.rows.length === 0}
                 empty={empty ?? <EmptyState title="The query returned no rows." />}>
            {(d) => children(d)}
          </Async>
        </div>
        <div className="min-w-0">{data && <SqlBlock sql={data.sql} params={data.params} />}</div>
      </div>
    </section>
  );
}

function RankingChart({ rows }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }}>
        <CartesianGrid horizontal={false} stroke={CHROME.grid} />
        <XAxis type="number" tick={{ fill: CHROME.axis, fontSize: 12 }} tickLine={false} axisLine={{ stroke: CHROME.baseline }} />
        <YAxis type="category" dataKey="label" width={112} tick={{ fill: CHROME.axis, fontSize: 12 }} tickLine={false} axisLine={false} />
        <Tooltip content={<ChartTooltip digits={1} />} cursor={{ fill: "rgba(11,11,11,0.04)" }} />
        <Bar dataKey="avg_aqi" name="Average AQI" fill={SERIES.aqi} maxBarSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          <LabelList dataKey="avg_aqi" position="right" fill="#52514e" fontSize={12} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function MovingAverageChart({ rows }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={CHROME.grid} />
        <XAxis dataKey="day" tickFormatter={fmtDayMonth} minTickGap={24} tick={{ fill: CHROME.axis, fontSize: 12 }}
               tickLine={false} axisLine={{ stroke: CHROME.baseline }} />
        <YAxis width={40} tick={{ fill: CHROME.axis, fontSize: 12 }} tickLine={false} axisLine={false} />
        <Tooltip content={<ChartTooltip labelFormatter={fmtDate} />} cursor={{ stroke: CHROME.baseline }} />
        <Legend verticalAlign="top" height={28} iconType="plainline"
                formatter={(value) => <span style={{ color: "#52514e", fontSize: 12 }}>{value}</span>} />
        <Line dataKey="day_avg_aqi" name="Daily average" stroke={SERIES.muted} strokeWidth={1.5} dot={false} isAnimationActive={false} />
        <Line dataKey="moving_avg_7d" name="7-day moving average" stroke={SERIES.aqi} strokeWidth={2} dot={false}
              activeDot={{ r: 4, stroke: CHROME.surface, strokeWidth: 2 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function UserWarningDays({ regions }) {
  const { user, isAdmin } = useAuth();
  const users = useApi(isAdmin ? "/api/admin/app-user?limit=500" : null, { auth: true });
  const [userId, setUserId] = useState("");
  const state = useApi(user ? `/api/analytics/user-warning-days${query({ user_id: userId })}` : null, { auth: true });

  if (!user) {
    return (
      <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-rain">Query 5 · Multi-table join</p>
        <h2 className="mt-1 text-lg font-semibold">Days my region had an Orange or Red warning</h2>
        <p className="mt-2 text-sm text-ink-2">
          This one depends on who you are (APP_USER to LOCATION to REGION_WARNING).{" "}
          <Link to="/login?next=/analytics" className="font-medium text-rain hover:underline">Log in</Link> to run it.
        </p>
      </section>
    );
  }
  const regionName = (id) => regions?.find((r) => r.region_id === id)?.region ?? "";
  return (
    <QueryCard number={5} feature="Multi-table join" state={state}
               controls={isAdmin && users.data && (
                 <Control label="User (admins can pick anyone)">
                   <select className={selectClass} value={userId} onChange={(e) => setUserId(e.target.value)}>
                     <option value="">Me ({user.name})</option>
                     {users.data.rows.filter((u) => u.user_id !== user.user_id).map((u) => (
                       <option key={u.user_id} value={u.user_id}>{u.name} · {regionName(u.region_id)}</option>
                     ))}
                   </select>
                 </Control>
               )}
               empty={<EmptyState title="No Orange or Red warnings for this user's region"
                                  hint="Only Yellow (or no) warnings were raised there in the stored period." />}>
      {(d) => (
        <DataTable rows={d.rows} columns={[
          { key: "valid_date", label: "Date", render: (r) => fmtDate(r.valid_date) },
          { key: "region", label: "Region" },
          { key: "hazard", label: "Hazard" },
          { key: "warning_level", label: "Level", render: (r) => <LevelChip level={r.warning_level} /> },
          { key: "source", label: "Source", render: (r) => <SourceTag source={r.source} /> },
          { key: "advisory_text", label: "Advisory" },
        ]} />
      )}
    </QueryCard>
  );
}

export default function AnalyticsPage() {
  const regions = useApi("/api/regions");
  const [minDays, setMinDays] = useState(20);
  const [rankDays, setRankDays] = useState(30);
  const [maRegion, setMaRegion] = useState("");
  const [maDays, setMaDays] = useState(30);
  const [limit, setLimit] = useState(25);

  // The team's page: every call sends the admin's login (the API refuses anyone else).
  const auth = { auth: true };
  const monthly = useApi(`/api/analytics/monthly-temperature${query({ min_days: minDays })}`, auth);
  const ranking = useApi(`/api/analytics/aqi-ranking${query({ days: rankDays })}`, auth);
  const regionForMa = maRegion || regions.data?.find((r) => r.region === "Colaba")?.region_id || regions.data?.[0]?.region_id;
  const moving = useApi(regionForMa ? `/api/analytics/aqi-moving-average${query({ days: maDays, region_id: regionForMa })}` : null, auth);
  const rain = useApi(`/api/analytics/rain-above-region-average${query({ limit })}`, auth);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">
          Each result below comes from one SQL file in <code>backend/app/sql/analytics/</code>. The SQL shown next to
          it is exactly what PostgreSQL ran, with the parameters listed underneath it. Change a setting to re-run the query.
        </p>
      </header>

      <QueryCard number={1} feature="GROUP BY + HAVING" state={monthly}
                 controls={
                   <Control label="HAVING: at least N days of data" hint="Raise it until the current month (still incomplete) drops out.">
                     <input type="number" min={1} max={31} value={minDays} className={`${selectClass} w-24`}
                            onChange={(e) => setMinDays(Math.min(31, Math.max(1, Number(e.target.value) || 1)))} />
                   </Control>
                 }
                 empty={<EmptyState title="No month has that many days of data" hint="Lower the number." />}>
        {(d) => (
          <DataTable rows={d.rows} columns={[
            { key: "region", label: "Region" },
            { key: "month", label: "Month" },
            { key: "days_of_data", label: "Days", align: "right" },
            { key: "avg_temp", label: "Avg °C", align: "right", render: (r) => num(r.avg_temp) },
            { key: "min_temp", label: "Min °C", align: "right", render: (r) => num(r.min_temp) },
            { key: "max_temp", label: "Max °C", align: "right", render: (r) => num(r.max_temp) },
          ]} />
        )}
      </QueryCard>

      <QueryCard number={2} feature="Window function RANK()" state={ranking}
                 controls={
                   <Control label="Period">
                     <select className={selectClass} value={rankDays} onChange={(e) => setRankDays(Number(e.target.value))}>
                       <option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
                     </select>
                   </Control>
                 }>
        {(d) => {
          const rows = d.rows.map((r) => ({ ...r, label: `${r.rank}. ${r.region}` }));
          return (
            <ChartCard title="Average AQI by region, worst air first" subtitle="Equal averages share a rank (RANK, not ROW_NUMBER)"
                       height={Math.max(220, rows.length * 30)}
                       table={{ rows, columns: [{ key: "rank", label: "Rank", align: "right" }, { key: "region", label: "Region" },
                                                { key: "avg_aqi", label: "Average AQI", align: "right" },
                                                { key: "worst_aqi", label: "Worst hour", align: "right" },
                                                { key: "readings", label: "Readings", align: "right" }] }}>
              <RankingChart rows={rows} />
            </ChartCard>
          );
        }}
      </QueryCard>

      <QueryCard number={3} feature="Window function: 7-day moving average" state={moving}
                 controls={
                   <>
                     <Control label="Region">
                       <select className={selectClass} value={regionForMa ?? ""} onChange={(e) => setMaRegion(Number(e.target.value))}>
                         {regions.data?.map((r) => <option key={r.region_id} value={r.region_id}>{r.region}</option>)}
                       </select>
                     </Control>
                     <Control label="Period">
                       <select className={selectClass} value={maDays} onChange={(e) => setMaDays(Number(e.target.value))}>
                         <option value={30}>Last 30 days</option><option value={60}>Last 60 days</option><option value={90}>Last 90 days</option>
                       </select>
                     </Control>
                   </>
                 }>
        {(d) => (
          <ChartCard title={`Daily AQI and its 7-day moving average · ${d.rows[0]?.region ?? ""}`}
                     subtitle="Each point of the blue line averages that day and the 6 days before it"
                     table={{ rows: d.rows, columns: [{ key: "day", label: "Day", render: (r) => fmtDate(r.day) },
                                                      { key: "day_avg_aqi", label: "Daily avg", align: "right" },
                                                      { key: "moving_avg_7d", label: "7-day avg", align: "right" }] }}>
            <MovingAverageChart rows={d.rows} />
          </ChartCard>
        )}
      </QueryCard>

      <QueryCard number={4} feature="Correlated subquery" state={rain}
                 controls={
                   <Control label="Show the top">
                     <select className={selectClass} value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
                       <option value={10}>10 rows</option><option value={25}>25 rows</option><option value={50}>50 rows</option>
                     </select>
                   </Control>
                 }>
        {(d) => (
          <DataTable rows={d.rows} columns={[
            { key: "region", label: "Region" },
            { key: "station_name", label: "Station" },
            { key: "reading_date", label: "Date", render: (r) => fmtDate(r.reading_date) },
            { key: "rain_mm", label: "Rain (mm)", align: "right", render: (r) => num(r.rain_mm) },
            { key: "region_avg_mm", label: "Region's average day", align: "right", render: (r) => num(r.region_avg_mm) },
            { key: "times", label: "× average", align: "right",
              render: (r) => (r.region_avg_mm ? `${num(r.rain_mm / r.region_avg_mm)}×` : "–") },
          ]} />
        )}
      </QueryCard>

      <UserWarningDays regions={regions.data} />
    </div>
  );
}
