// The dashboard's first answer: "Is there a warning for my area today?"
// If several hazards are active, the most serious one is the headline (the API
// already sorts by warning_rank, most serious first); the rest are listed below it.
//
//   showSource  the team sees who raised each warning (the trigger or an admin);
//               everyone else just sees when it was last updated
//   headingAs   "h1" on the dashboard; the landing page's example uses "h3"
//   showTime    the landing page's example hides the time stamp
//   note        the dashboard's "What this means for you" sentence
import { LEVELS } from "../lib/colors";
import { fmtDate, fmtStamp } from "../lib/format";
import { LevelChip, SourceTag } from "./Badges";

function stampLine(w, showSource) {
  if (!showSource) return `Updated ${fmtStamp(w.issued_at)}`;
  return w.source === "admin"
    ? `Issued by an admin · ${fmtStamp(w.issued_at)}`
    : `Raised automatically from Open-Meteo readings · ${fmtStamp(w.issued_at)}`;
}

export default function WarningAnswer({ answer, showSource = false, headingAs: Heading = "h1", showTime = true, note }) {
  const { region, date, highest_level: level, has_warning: yes, warnings } = answer;
  const active = warnings.filter((w) => w.warning_level !== "Green");
  const cleared = warnings.filter((w) => w.warning_level === "Green");
  const headline = active[0];
  const others = active.slice(1);
  const info = LEVELS[level] ?? LEVELS.Green;

  return (
    <section aria-labelledby="answer-heading" className="overflow-hidden rounded-[20px] bg-surface shadow-card">
      <div className="flex">
        <div aria-hidden="true" className="w-2 shrink-0 sm:w-3" style={{ background: info.color }} />
        <div className="min-w-0 flex-1 p-5 sm:p-6" style={{ background: info.tint }}>
          <p className="text-sm font-medium text-ink-2">
            Is there a warning for {region} today? · <span className="whitespace-nowrap">{fmtDate(date)}</span>
          </p>

          {yes ? (
            <>
              <Heading id="answer-heading" className="mt-1 text-2xl font-bold leading-tight text-ink sm:text-3xl">
                Yes: {level} warning for {headline.hazard.toLowerCase()} in {region}
              </Heading>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-2">
                <LevelChip level={level} /> <span className="font-medium text-ink">{info.meaning}</span>
              </p>
              {headline.advisory_text && <p className="mt-3 max-w-3xl text-ink">{headline.advisory_text}</p>}
              {showTime && (
                <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-2">
                  {showSource && <SourceTag source={headline.source} />} {stampLine(headline, showSource)}
                </p>
              )}
            </>
          ) : (
            <>
              <Heading id="answer-heading" className="mt-1 text-2xl font-bold leading-tight text-ink sm:text-3xl">
                No, there is no warning for {region} today.
              </Heading>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-2">
                <LevelChip level="Green" /> No rain, heat or air-quality threshold has been reached so far today.
              </p>
            </>
          )}

          {others.length > 0 && (
            <div className="mt-4 border-t border-black/10 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-2">Also in force today</p>
              <ul className="mt-2 space-y-2">
                {others.map((w) => (
                  <li key={w.hazard} className="text-sm">
                    <span className="flex flex-wrap items-center gap-2">
                      <LevelChip level={w.warning_level} /> <span className="font-medium">{w.hazard}</span>
                      {showSource && <SourceTag source={w.source} />}
                    </span>
                    {w.advisory_text && <span className="mt-0.5 block text-ink-2">{w.advisory_text}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {note && (
            <p className="mt-4 rounded-xl bg-white/70 px-4 py-3 text-sm text-ink">
              <span className="font-semibold">What this means for you: </span>{note}
            </p>
          )}

          {cleared.length > 0 && (
            <p className="mt-3 text-xs text-ink-2">
              {showSource
                ? `Cleared by an admin today: ${cleared.map((w) => `${w.hazard} (${fmtStamp(w.issued_at)})`).join(", ")}.`
                : `Lifted earlier today: ${cleared.map((w) => `the ${w.hazard.toLowerCase()} warning (${fmtStamp(w.issued_at)})`).join(", ")}.`}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
