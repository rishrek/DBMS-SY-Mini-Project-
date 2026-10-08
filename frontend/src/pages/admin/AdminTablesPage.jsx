// Admin → Tables: browse, insert, edit and delete rows of the poster's 7 tables
// (plus WARNING_THRESHOLD). The backend builds each statement from a fixed
// list of table and column names and returns the SQL it ran; we show it.
import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { apiFetch, keyPath, query } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import { fmtStamp } from "../../lib/format";
import { Async, EmptyState, ErrorState } from "../../components/States";
import { LevelChip } from "../../components/Badges";
import DataTable from "../../components/DataTable";
import RecordForm from "../../components/RecordForm";
import SqlBlock from "../../components/SqlBlock";

const PAGE = 25;
const smallInput = "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm";

function Filters({ names, values, onChange, lookups }) {
  if (names.length === 0) return null;
  const set = (name) => (e) => onChange({ ...values, [name]: e.target.value });
  return (
    <div className="flex flex-wrap items-end gap-3">
      {names.map((name) => (
        <label key={name} className="flex flex-col gap-1 text-xs font-medium text-ink-2">
          {name.replaceAll("_", " ")}
          {name === "region_id" ? (
            <select className={smallInput} value={values[name] ?? ""} onChange={set(name)}>
              <option value="">All regions</option>
              {lookups.regions.map((r) => <option key={r.region_id} value={r.region_id}>{r.region}</option>)}
            </select>
          ) : name === "station_id" ? (
            <select className={smallInput} value={values[name] ?? ""} onChange={set(name)}>
              <option value="">All stations</option>
              {lookups.stations.map((s) => <option key={s.station_id} value={s.station_id}>{s.station_name}</option>)}
            </select>
          ) : name.startsWith("date_") ? (
            <input type="date" className={smallInput} value={values[name] ?? ""} onChange={set(name)} />
          ) : name === "source" ? (
            <select className={smallInput} value={values[name] ?? ""} onChange={set(name)}>
              <option value="">Any</option><option value="auto">auto</option><option value="admin">admin</option>
            </select>
          ) : name === "role" ? (
            <select className={smallInput} value={values[name] ?? ""} onChange={set(name)}>
              <option value="">Any</option><option value="admin">admin</option><option value="user">user</option>
            </select>
          ) : (
            <input className={smallInput} value={values[name] ?? ""} onChange={set(name)} />
          )}
        </label>
      ))}
      <button type="button" onClick={() => onChange({})} className="rounded-lg px-2 py-1.5 text-sm text-ink-2 hover:text-ink">
        Clear filters
      </button>
    </div>
  );
}

function TableBrowser({ spec, lookups }) {
  const { token } = useAuth();
  const [filters, setFilters] = useState({});
  const [offset, setOffset] = useState(0);
  const [form, setForm] = useState(null);           // { mode: "create" | "update", row }
  const [lastChange, setLastChange] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const list = useApi(`/api/admin/${spec.slug}${query({ ...filters, limit: PAGE, offset })}`, { auth: true });

  const regionName = (id) => lookups.regions.find((r) => r.region_id === id)?.region;
  const stationName = (id) => lookups.stations.find((s) => s.station_id === id)?.station_name;
  const keyOf = (row) => keyPath(spec.primary_key.map((k) => row[k]));

  const columns = spec.columns.map((c) => ({
    key: c,
    label: c,
    render: (row) => {
      const v = row[c];
      if (v === null || v === undefined) return <span className="text-muted">NULL</span>;
      if (c === "region_id") return <>{v} <span className="text-ink-2">· {regionName(v)}</span></>;
      if (c === "station_id") return <>{v} <span className="text-ink-2">· {stationName(v)}</span></>;
      if (c === "warning_level") return <LevelChip level={v} />;
      if (c === "issued_at" || c === "created_at") return fmtStamp(v);
      return typeof v === "number" ? <span className="tabular">{v.toLocaleString("en-IN")}</span> : String(v);
    },
  }));

  const save = async (payload) => {
    setBusy(true);
    setError(null);
    try {
      const updating = form.mode === "update";
      const res = await apiFetch(`/api/admin/${spec.slug}${updating ? `/${keyOf(form.row)}` : ""}`,
                                 { method: updating ? "PUT" : "POST", json: payload, token });
      setLastChange({ sql: res.sql, message: updating ? "Row updated." : "Row inserted." });
      setForm(null);
      list.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row) => {
    const what = spec.primary_key.map((k) => `${k} = ${row[k]}`).join(", ");
    if (!window.confirm(`Delete the ${spec.table} row with ${what}?`)) return;
    setError(null);
    try {
      const res = await apiFetch(`/api/admin/${spec.slug}/${keyOf(row)}`, { method: "DELETE", token });
      setLastChange({ sql: res.sql, message: "Row deleted." });
      list.reload();
    } catch (err) {
      setError(err);
    }
  };

  const total = list.data?.total ?? 0;
  return (
    <div className="space-y-4">
      {spec.note && <p className="rounded-lg bg-page px-3 py-2 text-sm text-ink-2">{spec.note}</p>}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Filters names={spec.filters} values={filters} lookups={lookups}
                 onChange={(f) => { setFilters(f); setOffset(0); }} />
        {spec.can_create && !form && (
          <button type="button" onClick={() => { setForm({ mode: "create" }); setError(null); }}
                  className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white">
            Add a row
          </button>
        )}
      </div>

      {form && (
        <RecordForm key={`${form.mode}-${form.row ? keyOf(form.row) : "new"}`}
                    title={form.mode === "create" ? `New ${spec.table} row` : `Edit ${spec.table} row`}
                    schema={form.mode === "create" ? spec.create_schema : spec.update_schema}
                    row={form.row} mode={form.mode} lookups={lookups} busy={busy}
                    onSubmit={save} onCancel={() => { setForm(null); setError(null); }} />
      )}
      {error && <ErrorState error={error} title="The change was not saved" />}
      {lastChange && !error && (
        <p role="status" className="rounded-lg bg-[#e8f6e8] px-3 py-2 text-sm font-medium text-[#0b5f0b]">{lastChange.message}</p>
      )}

      <Async state={list} loadingLabel={`Loading ${spec.table}…`} isEmpty={(d) => d.rows.length === 0}
             empty={<EmptyState title="No rows match" hint="Change the filters, or add a row." />}>
        {(d) => (
          <div className="space-y-2">
            <DataTable dense columns={columns} rows={d.rows} rowKey={keyOf}
                       actions={(row) => (
                         <span className="flex justify-end gap-1">
                           {spec.can_update && (
                             <button type="button" onClick={() => { setForm({ mode: "update", row }); setError(null); }}
                                     className="rounded-md border border-line px-2 py-0.5 text-xs font-medium hover:bg-page">Edit</button>
                           )}
                           <button type="button" onClick={() => remove(row)}
                                   className="rounded-md border border-line px-2 py-0.5 text-xs font-medium text-[#8f1f1f] hover:bg-[#fbe6e6]">Delete</button>
                         </span>
                       )} />
            <div className="flex items-center justify-between text-sm text-ink-2">
              <span className="tabular">Rows {total === 0 ? 0 : offset + 1}–{Math.min(offset + PAGE, total)} of {total.toLocaleString("en-IN")}</span>
              <span className="flex gap-2">
                <button type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}
                        className="rounded-md border border-line px-3 py-1 disabled:opacity-40">Previous</button>
                <button type="button" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}
                        className="rounded-md border border-line px-3 py-1 disabled:opacity-40">Next</button>
              </span>
            </div>
          </div>
        )}
      </Async>

      <div className="grid gap-4 xl:grid-cols-2">
        {lastChange && <SqlBlock title="SQL of the last change" sql={lastChange.sql} />}
        {list.data && <SqlBlock title="SQL of this list" sql={list.data.sql} params={list.data.params} />}
      </div>
    </div>
  );
}

export default function AdminTablesPage() {
  const tables = useApi("/api/admin/tables", { auth: true });
  const regions = useApi("/api/regions");
  const stations = useApi("/api/stations/map", { auth: true });   // station names for the WEATHER_DATA tab and forms
  const [slug, setSlug] = useState("location");

  return (
    <Async state={tables} loadingLabel="Loading the table list…">
      {(specs) => {
        const spec = specs.find((s) => s.slug === slug) ?? specs[0];
        const lookups = { regions: regions.data ?? [], stations: stations.data ?? [] };
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tables">
              {specs.map((s) => (
                <button key={s.slug} type="button" role="tab" aria-selected={s.slug === spec.slug}
                        onClick={() => setSlug(s.slug)}
                        className={`rounded-lg border px-3 py-1.5 font-mono text-xs font-semibold ${s.slug === spec.slug ? "border-navy bg-navy text-white" : "border-line bg-surface text-ink-2 hover:text-ink"}`}>
                  {s.table}
                </button>
              ))}
            </div>
            {/* key= resets filters, paging and forms when the table changes */}
            <TableBrowser key={spec.slug} spec={spec} lookups={lookups} />
          </div>
        );
      }}
    </Async>
  );
}
