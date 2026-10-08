// "This week": the 7-day forecast from REGION_FORECAST. Each day's bar runs from
// its low to its high, placed on one scale for the whole week, so warm and cool
// days can be compared at a glance.
import { Drop } from "@phosphor-icons/react";
import { fmtDay, fmtDayMonth, num } from "../lib/format";
import { WeatherIcon } from "../lib/weather";

export default function WeekForecast({ days }) {
  const lows = days.map((d) => d.min_temp).filter((t) => t != null);
  const highs = days.map((d) => d.max_temp).filter((t) => t != null);
  const bottom = Math.min(...lows);
  const span = Math.max(Math.max(...highs) - bottom, 1);

  return (
    <section id="week" aria-labelledby="week-heading" className="card scroll-mt-24 p-5">
      <h2 id="week-heading" className="font-semibold text-ink">This week</h2>
      <p className="text-sm text-ink-2">Forecast for the next 7 days, refreshed every hour.</p>
      <ol className="mt-4 space-y-1">
        {days.map((d, i) => (
          <li key={d.forecast_date} className="rounded-xl px-2 py-2.5 hover:bg-page/70">
            <div className="grid grid-cols-[4.5rem_2rem_2.25rem_minmax(0,1fr)_2.25rem] items-center gap-3">
              <span className="text-sm font-medium text-ink">
                {i === 0 ? "Today" : fmtDay(d.forecast_date)}
                <span className="block text-xs font-normal text-muted">{fmtDayMonth(d.forecast_date)}</span>
              </span>
              <WeatherIcon text={d.forecast_text} size={28} />
              <span className="text-right text-sm text-ink-2 tabular">{num(d.min_temp, 0)}°</span>
              <span className="relative h-2 rounded-full bg-page" aria-hidden="true">
                <span className="absolute inset-y-0 rounded-full bg-gradient-to-r from-[#7fb2e6] to-[#f2a93b]"
                      style={{ left: `${((d.min_temp - bottom) / span) * 100}%`,
                               width: `${Math.max(((d.max_temp - d.min_temp) / span) * 100, 4)}%` }} />
              </span>
              <span className="text-sm font-semibold text-ink tabular">{num(d.max_temp, 0)}°</span>
            </div>
            <p className="mt-1 flex items-center gap-1.5 pl-[5.25rem] text-xs text-ink-2">
              {d.forecast_text}
              <span className="flex items-center gap-0.5 text-muted"><Drop size={12} aria-hidden="true" /> {d.rain_probability ?? "–"}%</span>
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
