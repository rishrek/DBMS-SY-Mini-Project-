// Admin → Warnings: issue, edit, clear and delete warnings (all admin-owned).
// "Clear" keeps the row at Green so the trigger can't raise it again that day.
import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { apiFetch, keyPath, query } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import { LEVEL_NAMES } from "../../lib/colors";
import { fmtDate, fmtStamp, todayIST } from "../../lib/format";
import { Async, EmptyState, ErrorState } from "../../components/States";
import { LevelChip, SourceTag } from "../../components/Badges";
import DataTable from "../../components/DataTable";
import SqlBlock from "../../components/SqlBlock";
import { inputClass } from "../../lib/ui";

const HAZARDS = ["Rain", "Heat", "Air Quality", "Thunderstorm", "Landslide", "Flood", "Cyclone"];
const smallInput = "rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm";

function IssueForm({ regions, onDone }) {
  const { token } = useAuth();
  const [form, setForm] = useState({ region_id: "", valid_date: todayIST(), hazard: "Rain", warning_level: "Yellow", advisory_text: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch("/api/admin/warnings", {
        method: "POST", token,
        json: { ...form, region_id: Number(form.region_id), advisory_text: form.advisory_text || null },
      });
      onDone(res.sql, `Issued: ${res.warning.warning_level} ${res.warning.hazard} warning.`);
      setForm((f) => ({ ...f, advisory_text: "" }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="font-semibold">Issue a warning</h2>
      <p className="text-xs text-ink-2">If this region already has a warning for that date and hazard (even an automatic one), yours replaces it.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-medium text-ink-2">Region
          <select required className={inputClass} value={form.region_id} onChange={set("region_id")}>
            <option value="">Choose…</option>
            {regions.map((r) => <option key={r.region_id} value={r.region_id}>{r.region}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-ink-2">Date
          <input type="date" required className={inputClass} value={form.valid_date} onChange={set("valid_date")} />
        </label>
        <label className="text-xs font-medium text-ink-2">Hazard
          <input list="hazards" required maxLength={50} className={inputClass} value={form.hazard} onChange={set("hazard")} />
          <datalist id="hazards">{HAZARDS.map((h) => <option key={h} value={h} />)}</datalist>
        </label>
        <label className="text-xs font-medium text-ink-2">Level
          <select className={inputClass} value={form.warning_level} onChange={set("warning_level")}>
            {LEVEL_NAMES.filter((l) => l !== "Green").map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <label className="text-xs font-medium text-ink-2 sm:col-span-2 lg:col-span-4">Advisory text (what people should do)
          <textarea rows={2} className={inputClass} value={form.advisory_text} onChange={set("advisory_text")} />
        </label>
      </div>
      {error && <div className="mt-3"><ErrorState error={error} title="The warning was not issued" /></div>}
      <button type="submit" disabled={busy} className="mt-3 rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
        {busy ? "Issuing…" : "Issue warning"}
      </button>
    </form>
  );
}

export default function AdminWarningsPage() {
  const { token } = useAuth();
  const regions = useApi("/api/regions");
  const [filters, setFilters] = useState({ region_id: "", date_from: "", date_to: "", source: "" });
  const list = useApi(`/api/admin/warnings${query({ ...filters, limit: 300 })}`, { auth: true, live: ["region_warning"] });
  const [editing, setEditing] = useState(null);      // { key, warning_level, advisory_text }
  const [last, setLast] = useState(null);
  const [error, setError] = useState(null);
  const setF = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const keyOf = (w) => keyPath([w.region_id, w.valid_date, w.hazard]);

  const act = async (path, options, message) => {
    setError(null);
    try {
      const res = await apiFetch(path, { token, ...options });
      setLast({ sql: res.sql, message });
      setEditing(null);
      list.reload();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <div className="space-y-5">
      <Async state={regions} loadingLabel="Loading regions…">
        {(r) => <IssueForm regions={r} onDone={(sql, message) => { setLast({ sql, message }); list.reload(); }} />}
      </Async>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">Region
          <select className={smallInput} value={filters.region_id} onChange={setF("region_id")}>
            <option value="">All regions</option>
            {(regions.data ?? []).map((r) => <option key={r.region_id} value={r.region_id}>{r.region}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">From
          <input type="date" className={smallInput} value={filters.date_from} onChange={setF("date_from")} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">To
          <input type="date" className={smallInput} value={filters.date_to} onChange={setF("date_to")} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">Source
          <select className={smallInput} value={filters.source} onChange={setF("source")}>
            <option value="">Any</option><option value="auto">automatic</option><option value="admin">admin</option>
          </select>
        </label>
      </div>

      {error && <ErrorState error={error} title="That didn't work" />}
      {last && !error && <p role="status" className="rounded-lg bg-[#e8f6e8] px-3 py-2 text-sm font-medium text-[#0b5f0b]">{last.message}</p>}

      <Async state={list} loadingLabel="Loading warnings…" isEmpty={(d) => d.warnings.length === 0}
             empty={<EmptyState title="No warnings match these filters" />}>
        {(d) => (
          <DataTable dense rows={d.warnings} rowKey={keyOf}
                     columns={[
                       { key: "valid_date", label: "Date", render: (w) => fmtDate(w.valid_date) },
                       { key: "region", label: "Region" },
                       { key: "hazard", label: "Hazard" },
                       { key: "warning_level", label: "Level", render: (w) => (
                         editing?.key === keyOf(w) ? (
                           <select className={smallInput} value={editing.warning_level}
                                   onChange={(e) => setEditing({ ...editing, warning_level: e.target.value })}>
                             {LEVEL_NAMES.map((l) => <option key={l} value={l}>{l}</option>)}
                           </select>
                         ) : <LevelChip level={w.warning_level} />) },
                       { key: "source", label: "Source", render: (w) => <SourceTag source={w.source} /> },
                       { key: "advisory_text", label: "Advisory", render: (w) => (
                         editing?.key === keyOf(w) ? (
                           <textarea rows={2} className={`${smallInput} w-72`} value={editing.advisory_text}
                                     onChange={(e) => setEditing({ ...editing, advisory_text: e.target.value })} />
                         ) : <span className="block max-w-sm whitespace-normal">{w.advisory_text ?? "–"}</span>) },
                       { key: "issued_at", label: "Issued", render: (w) => fmtStamp(w.issued_at) },
                     ]}
                     actions={(w) => (
                       editing?.key === keyOf(w) ? (
                         <span className="flex justify-end gap-1">
                           <button type="button" className="rounded-md bg-navy px-2 py-0.5 text-xs font-medium text-white"
                                   onClick={() => act(`/api/admin/warnings/${keyOf(w)}`,
                                     { method: "PUT", json: { warning_level: editing.warning_level, advisory_text: editing.advisory_text || null } },
                                     `Edited: ${w.hazard} in ${w.region} is now ${editing.warning_level}.`)}>Save</button>
                           <button type="button" className="rounded-md border border-line px-2 py-0.5 text-xs" onClick={() => setEditing(null)}>Cancel</button>
                         </span>
                       ) : (
                         <span className="flex justify-end gap-1">
                           <button type="button" className="rounded-md border border-line px-2 py-0.5 text-xs font-medium hover:bg-page"
                                   onClick={() => setEditing({ key: keyOf(w), warning_level: w.warning_level, advisory_text: w.advisory_text ?? "" })}>Edit</button>
                           {w.warning_level !== "Green" && (
                             <button type="button" className="rounded-md border border-line px-2 py-0.5 text-xs font-medium hover:bg-page"
                                     onClick={() => act(`/api/admin/warnings/${keyOf(w)}/clear`, { method: "POST", json: {} },
                                                       `Cleared: ${w.hazard} in ${w.region} (kept as Green, admin-owned).`)}>Clear</button>
                           )}
                           <button type="button" className="rounded-md border border-line px-2 py-0.5 text-xs font-medium text-[#8f1f1f] hover:bg-[#fbe6e6]"
                                   onClick={() => {
                                     if (window.confirm("Delete this warning? If it was automatic and the threshold is still exceeded, the trigger will raise it again at the next reading. Use Clear to stop that.")) {
                                       act(`/api/admin/region-warning/${keyOf(w)}`, { method: "DELETE" }, `Deleted: ${w.hazard} in ${w.region}.`);
                                     }
                                   }}>Delete</button>
                         </span>
                       ))} />
        )}
      </Async>

      <div className="grid gap-4 xl:grid-cols-2">
        {last && <SqlBlock title="SQL of the last change" sql={last.sql} />}
        {list.data && <SqlBlock title="SQL of this list" sql={list.data.sql} />}
      </div>
    </div>
  );
}
