// The navy "right now" panel: the area, the time, the temperature and sky, how it
// feels, and the chance of rain for each day this week.
import { feelsLikeNote } from "../lib/advice";
import { fmtClock, fmtDay, fmtReading, num } from "../lib/format";
import { WeatherIcon } from "../lib/weather";

export default function NowPanel({ area, reading, days, now, night }) {
  return (
    <section aria-labelledby="now-heading"
             className="rounded-[20px] bg-gradient-to-br from-navy-2 via-navy to-[#0a1d31] p-6 text-white shadow-card">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="now-heading" className="truncate text-2xl font-semibold">{area}</h2>
          <p className="truncate text-sm text-white/70">{reading?.station_name ?? "Maharashtra"}</p>
        </div>
        <p className="text-lg font-semibold tabular" aria-label={`Time in India: ${fmtClock(now)}`}>{fmtClock(now)}</p>
      </div>

      {reading ? (
        <>
          <div className="mt-7 flex items-end justify-between gap-4">
            <div>
              <WeatherIcon text={reading.current_conditions} night={night} size={52} onDark />
              <p className="mt-3 text-6xl font-semibold leading-none tracking-tight tabular">
                {num(reading.current_temp, 0)}°<span className="align-top text-3xl"> C</span>
              </p>
            </div>
            <p className="max-w-[10rem] text-right text-lg font-medium leading-snug">{reading.current_conditions}</p>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-white/85">
            Feels like {num(reading.feels_like, 0)}°. {feelsLikeNote(reading.current_temp, reading.feels_like)}
          </p>
          <p className="mt-1 text-xs text-white/60">Reading of {fmtReading(reading.reading_at)} IST, from Open-Meteo</p>
        </>
      ) : (
        <p className="mt-6 text-white/80">No reading yet for {area}. The next one arrives within 15 minutes.</p>
      )}

      {days?.length > 0 && (
        <>
          <hr className="my-6 border-white/15" />
          <h3 className="font-semibold">Chance of rain this week</h3>
          <ul className="mt-4 space-y-3">
            {days.map((d, i) => (
              <li key={d.forecast_date} className="grid grid-cols-[3.25rem_minmax(0,1fr)_2.75rem] items-center gap-3 text-sm">
                <span className="text-white/80">{i === 0 ? "Today" : fmtDay(d.forecast_date)}</span>
                <span className="h-2.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                  <span className="block h-full rounded-full bg-[#8fb6f5]" style={{ width: `${d.rain_probability ?? 0}%` }} />
                </span>
                <span className="text-right font-medium tabular">{d.rain_probability ?? "–"}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
