// Admin → Ingestion: the "Run ingestion" button, the scheduler's next run, and
// the run log from INGESTION_RUN.
import { useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { apiFetch } from "../../lib/api";
import { useApi } from "../../lib/useApi";
import { fmtStamp, num } from "../../lib/format";
import { Async, EmptyState, ErrorState } from "../../components/States";
import DataTable from "../../components/DataTable";
import LiveBadge from "../../components/LiveBadge";
import SqlBlock from "../../components/SqlBlock";

function Status({ status }) {
  const style = { success: "bg-[#e8f6e8] text-[#0b5f0b]", failed: "bg-[#fbe6e6] text-[#8f1f1f]", running: "bg-[#fef5de] text-[#6b4a00]" }[status];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style ?? "bg-page"}`}>{status}</span>;
}

export default function AdminIngestionPage() {
  const { token } = useAuth();
  const runs = useApi("/api/admin/ingestion/runs", { auth: true, live: ["ingestion_run"] });   // new runs appear by themselves
  const [busy, setBusy] = useState(null);
  const [days, setDays] = useState(7);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const run = async (mode) => {
    setBusy(mode);
    setError(null);
    setResult(null);
    try {
      setResult(await apiFetch("/api/admin/ingestion/run", { method: "POST", token, json: { mode, days } }));
      runs.reload();
    } catch (err) {
      setError(err);
      runs.reload();              // a failed run is logged too
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="font-semibold">Automatic updates</h2>
          {runs.data ? (
            runs.data.scheduler_running ? (
              <p className="mt-1 text-sm text-ink-2">
                The server downloads new readings every 15 minutes (at :00, :15, :30 and :45). Next run:{" "}
                <span className="font-medium text-ink">{fmtStamp(runs.data.next_scheduled_run)}</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-ink-2">The 15-minute job is switched off (ENABLE_SCHEDULER=false in .env).</p>
            )
          ) : <p className="mt-1 text-sm text-ink-2">Checking…</p>}
          <LiveBadge className="mt-2" />
          <p className="mt-2 text-xs text-ink-2">
            Each run downloads from Open-Meteo, then stores everything in ONE transaction: readings with
            INSERT … ON CONFLICT DO NOTHING (no duplicates), forecasts with ON CONFLICT DO UPDATE (newest wins).
            When it commits, triggers call pg_notify and every open page updates (database/05_live_updates.sql).
          </p>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-4">
          <h2 className="font-semibold">Run now</h2>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <button type="button" disabled={busy !== null} onClick={() => run("manual")}
                    className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
              {busy === "manual" ? "Downloading…" : "Get the latest readings"}
            </button>
            <label className="flex flex-col gap-1 text-xs font-medium text-ink-2">Backfill days
              <input type="number" min={1} max={365} value={days} onChange={(e) => setDays(Math.min(365, Math.max(1, Number(e.target.value) || 1)))}
                     className="w-24 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm" />
            </label>
            <button type="button" disabled={busy !== null} onClick={() => run("backfill")}
                    className="rounded-lg border border-navy px-4 py-2 text-sm font-medium text-navy disabled:opacity-60">
              {busy === "backfill" ? "Backfilling…" : `Backfill ${days} days`}
            </button>
          </div>
          <p className="mt-2 text-xs text-ink-2">"Latest readings" (every 15 minutes since yesterday) takes a few seconds; a 90-day backfill (hourly) about 15 seconds. Re-running never duplicates rows.</p>
          {error && <div className="mt-3"><ErrorState error={error} title="The run failed" /></div>}
          {result && (
            <dl role="status" className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-[#e8f6e8] p-3 text-sm sm:grid-cols-4">
              <div><dt className="text-xs text-ink-2">Readings downloaded</dt><dd className="font-semibold">{num(result.readings_fetched, 0)}</dd></div>
              <div><dt className="text-xs text-ink-2">New readings stored</dt><dd className="font-semibold">{num(result.readings_inserted, 0)}</dd></div>
              <div><dt className="text-xs text-ink-2">Forecast days saved</dt><dd className="font-semibold">{num(result.forecasts_saved, 0)}</dd></div>
              <div><dt className="text-xs text-ink-2">Warnings raised</dt><dd className="font-semibold">{num(result.warnings_raised, 0)}</dd></div>
            </dl>
          )}
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Run log (INGESTION_RUN)</h2>
        <Async state={runs} loadingLabel="Loading the run log…" isEmpty={(d) => d.runs.length === 0}
               empty={<EmptyState title="No runs yet" hint="Run the backfill first (scripts/backfill.py)." />}>
          {(d) => (
            <DataTable dense rows={d.runs} rowKey={(r) => r.run_id} columns={[
              { key: "run_id", label: "#", align: "right" },
              { key: "run_type", label: "Type" },
              { key: "status", label: "Status", render: (r) => <Status status={r.status} /> },
              { key: "started_at", label: "Started", render: (r) => fmtStamp(r.started_at) },
              { key: "seconds", label: "Seconds", align: "right" },
              { key: "rows_inserted", label: "New readings", align: "right" },
              { key: "warnings_raised", label: "Warnings", align: "right" },
              { key: "message", label: "Message", render: (r) => <span className="block max-w-xl whitespace-normal text-xs">{r.message}</span> },
            ]} />
          )}
        </Async>
        {runs.data && <SqlBlock title="SQL of the run log" sql={runs.data.sql} />}
      </section>
    </div>
  );
}
