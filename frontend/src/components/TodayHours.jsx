// "Earlier today": one small card per hour since midnight (from /api/regions/{id}/today),
// ending with "Now". It opens scrolled to the newest hour.
import { useEffect, useRef } from "react";
import { Drop, Umbrella } from "@phosphor-icons/react";
import { fmtHour, num } from "../lib/format";
import { istDate } from "../lib/useNow";
import { WeatherIcon } from "../lib/weather";

function isNight(when, sun) {
  return sun ? when < sun.sunrise || when > sun.sunset : false;
}

function HourCard({ time, temp, conditions, rainMm, humidity, night, now = false }) {
  const look = now ? "bg-navy text-white" : "bg-page/70 text-ink";
  return (
    <li className={`flex w-[92px] shrink-0 snap-end flex-col items-center gap-2 rounded-xl px-3 py-4 text-center ${look}`}>
      <span className={`text-sm font-medium ${now ? "text-white" : "text-ink-2"}`}>{now ? "Now" : time}</span>
      <span className="text-xl font-semibold tabular">{num(temp, 0)}°</span>
      <WeatherIcon text={conditions} night={night} size={30} onDark={now} />
      <span className={`flex items-center gap-1 text-xs ${now ? "text-white/80" : "text-ink-2"}`}>
        {rainMm > 0
          ? <><Umbrella size={14} aria-hidden="true" /> {num(rainMm)} mm</>
          : <><Drop size={14} aria-hidden="true" /> {num(humidity, 0)}%</>}
      </span>
    </li>
  );
}

export default function TodayHours({ hours, reading, sun }) {
  const list = useRef(null);
  useEffect(() => {                       // show the newest hour first
    if (list.current) list.current.scrollLeft = list.current.scrollWidth;
  }, [hours?.length, reading?.reading_at]);

  // The newest reading becomes "Now"; if it is on the hour, it replaces that hour's card.
  const nowAt = reading?.reading_at;
  const earlier = (hours ?? []).filter((h) => h.reading_at !== nowAt);

  return (
    <section aria-labelledby="hours-heading" className="card p-5">
      <h2 id="hours-heading" className="font-semibold text-ink">Earlier today</h2>
      <p className="text-sm text-ink-2">Every hour since midnight, and right now.</p>
      {earlier.length === 0 && !reading ? (
        <p className="mt-4 text-sm text-ink-2">The first reading of the day arrives just after midnight.</p>
      ) : (
        <ol ref={list} className="no-scrollbar mt-4 flex snap-x gap-3 overflow-x-auto pb-1">
          {earlier.map((h) => (
            <HourCard key={h.reading_at} time={fmtHour(h.reading_at)} temp={h.temp} conditions={h.conditions}
                      rainMm={h.rain_mm} humidity={h.humidity} night={isNight(istDate(h.reading_at), sun)} />
          ))}
          {reading && (
            <HourCard now temp={reading.current_temp} conditions={reading.current_conditions}
                      rainMm={reading.prec_intensity} humidity={reading.humidity} night={isNight(istDate(reading.reading_at), sun)} />
          )}
        </ol>
      )}
    </section>
  );
}
