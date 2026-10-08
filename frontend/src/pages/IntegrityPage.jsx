// The poster's Table 4 checks, re-run live on the current data every time the
// page loads (or "Run the checks again" is pressed).
import { useApi } from "../lib/useApi";
import { Async } from "../components/States";
import SqlBlock from "../components/SqlBlock";
import DataTable from "../components/DataTable";

function PassFail({ passed }) {
  return passed ? (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f6e8] px-2.5 py-0.5 text-xs font-semibold text-[#0b5f0b]">
      <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      PASS
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fbe6e6] px-2.5 py-0.5 text-xs font-semibold text-[#8f1f1f]">
      <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
      FAIL
    </span>
  );
}

export default function IntegrityPage() {
  const state = useApi("/api/integrity", { auth: true });   // the team's page: admin login only
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Integrity checks</h1>
          <p className="mt-1 max-w-3xl text-sm text-ink-2">
            The checks from our poster (Table 4), run again on today's data, plus three more that close the gap the
            poster noted: a BETWEEN match can't be enforced like a foreign key.
          </p>
        </div>
        <button type="button" onClick={state.reload} disabled={state.loading}
                className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {state.loading ? "Running…" : "Run the checks again"}
        </button>
      </header>

      <Async state={state} loadingLabel="Running the checks…">
        {(data) => (
          <div className="space-y-4">
            <div className={`rounded-2xl border p-4 ${data.all_passed ? "border-[#0ca30c]/40 bg-[#e8f6e8]" : "border-level-red/40 bg-[#fbe6e6]"}`}>
              <p className="flex items-center gap-3 font-semibold">
                <PassFail passed={data.all_passed} />
                {data.all_passed
                  ? `All ${data.checks.length} checks passed`
                  : `${data.checks.filter((c) => !c.passed).length} of ${data.checks.length} checks failed`}
              </p>
            </div>

            {data.checks.map((c, i) => (
              <section key={c.title} className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-ink-2">Check {i + 1}</p>
                    <h2 className="text-lg font-semibold">{c.title}</h2>
                    <p className="text-sm text-ink-2">{c.description}</p>
                  </div>
                  <PassFail passed={c.passed} />
                </div>
                <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <div className="rounded-lg bg-page/60 px-3 py-2"><dt className="text-xs text-ink-2">Expected</dt><dd className="font-medium">{c.expected}</dd></div>
                  <div className="rounded-lg bg-page/60 px-3 py-2"><dt className="text-xs text-ink-2">Result</dt><dd className="font-medium">{c.summary}</dd></div>
                </dl>
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <div className="min-w-0"><DataTable dense columns={c.columns} rows={c.rows} /></div>
                  <div className="min-w-0"><SqlBlock sql={c.sql} /></div>
                </div>
              </section>
            ))}
          </div>
        )}
      </Async>
    </div>
  );
}
