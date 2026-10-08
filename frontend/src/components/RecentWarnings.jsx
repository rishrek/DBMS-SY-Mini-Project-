// "Recent warnings in <your area>": the days your own area had an Orange or Red
// warning, newest first. It is the same multi-table join the team sees on the
// Analytics page (APP_USER -> LOCATION -> REGION_WARNING), shown in plain words.
// The API only ever returns the logged-in person's own area.
import { useState } from "react";
import { useApi } from "../lib/useApi";
import { fmtDate } from "../lib/format";
import { LevelChip } from "./Badges";
import { Async } from "./States";

const FIRST = 5;   // how many to show before "Show all"

export default function RecentWarnings({ area }) {
  const state = useApi("/api/analytics/user-warning-days", { auth: true, live: ["region_warning"] });
  const [showAll, setShowAll] = useState(false);

  return (
    <section aria-labelledby="recent-heading" className="card p-5">
      <h2 id="recent-heading" className="font-semibold">Recent warnings in {area}</h2>
      <p className="mt-0.5 text-sm text-ink-2">The days your area had an Orange or Red warning.</p>
      <Async state={state} loadingLabel="Looking back…" height="h-24" isEmpty={(d) => d.rows.length === 0}
             empty={<p className="mt-3 text-sm text-ink-2">No Orange or Red warnings in {area} so far. Long may it stay that way.</p>}>
        {(d) => (
          <>
            <ul className="mt-3 space-y-3">
              {(showAll ? d.rows : d.rows.slice(0, FIRST)).map((w) => (
                <li key={`${w.valid_date}-${w.hazard}`} className="flex gap-3">
                  <LevelChip level={w.warning_level} className="mt-0.5 h-fit shrink-0" />
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-ink">{fmtDate(w.valid_date)}, {w.hazard.toLowerCase()}</p>
                    {w.advisory_text && <p className="text-ink-2">{w.advisory_text}</p>}
                  </div>
                </li>
              ))}
            </ul>
            {d.rows.length > FIRST && (
              <button type="button" onClick={() => setShowAll((s) => !s)}
                      className="mt-3 text-sm font-medium text-navy underline underline-offset-2 hover:no-underline">
                {showAll ? "Show fewer" : `Show all ${d.rows.length}`}
              </button>
            )}
          </>
        )}
      </Async>
    </section>
  );
}
