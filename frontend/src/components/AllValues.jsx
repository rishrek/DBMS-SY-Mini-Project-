// "Every value in the latest reading": all 22 reading values of WEATHER_DATA for each
// station in the area (from v_current_conditions), folded away until someone opens it.
import { compass, fmtReading, num } from "../lib/format";

function Value({ label, value, sub }) {
  return (
    <div className="rounded-xl bg-page/70 p-3">
      <p className="text-xs text-ink-2">{label}</p>
      <p className="mt-0.5 font-semibold text-ink tabular">{value}</p>
      {sub && <p className="text-xs text-ink-2">{sub}</p>}
    </div>
  );
}

export default function AllValues({ rows }) {
  return (
    <details className="card group p-5">
      <summary className="cursor-pointer list-none font-semibold text-ink">
        Every value in the latest reading
        <span className="ml-2 text-sm font-normal text-ink-2 group-open:hidden">Show all 22</span>
        <span className="ml-2 hidden text-sm font-normal text-ink-2 group-open:inline">Hide</span>
      </summary>
      {rows.map((r) => (
        <div key={r.station_id} className="mt-4">
          <p className="text-sm text-ink-2">{r.station_name}, reading of {fmtReading(r.reading_at)} IST</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            <Value label="Conditions" value={r.current_conditions ?? "–"} />
            <Value label="Temperature" value={`${num(r.current_temp)} °C`} sub={`Today ${num(r.min_temp)} to ${num(r.max_temp)} °C`} />
            <Value label="Feels like" value={`${num(r.feels_like)} °C`} />
            <Value label="Wet-bulb temperature" value={`${num(r.wet_bulb)} °C`} sub="Heat-stress indicator" />
            <Value label="Humidity" value={`${num(r.humidity, 0)} %`} sub={`Dew point ${num(r.dew_point)} °C`} />
            <Value label="Wind" value={`${num(r.wind_speed)} km/h`} sub={`From the ${compass(r.wind_direction)} (${num(r.wind_direction, 0)}°)`} />
            <Value label="Pressure" value={`${num(r.pressure)} hPa`} sub="At mean sea level" />
            <Value label="Rain in the last hour" value={`${num(r.prec_intensity)} mm/h`}
                   sub={r.prec_intensity > 0 ? `${r.prec_intensity_label} ${r.prec_type?.toLowerCase() ?? "rain"}` : "No rain"} />
            <Value label="Rain today so far" value={`${num(r.prec_amount)} mm`} sub={`${num(r.prec_duration, 0)} rainy hours`} />
            <Value label="Chance of rain" value={`${num(r.prec_probability, 0)} %`} sub="This hour" />
            <Value label="Visibility" value={`${num(r.visibility)} km`} />
            <Value label="Air quality (CPCB)" value={`AQI ${num(r.aqi, 0)}`} sub={r.aqi_category ?? "No band"} />
            <Value label="PM2.5" value={`${num(r.pm2_5)} µg/m³`} sub="Fine particles" />
            <Value label="PM10" value={`${num(r.pm10)} µg/m³`} sub="Coarse particles" />
            <Value label="Ozone" value={`${num(r.ozone)} µg/m³`} />
            <Value label="Carbon dioxide" value={`${num(r.co2, 0)} ppm`} />
          </div>
        </div>
      ))}
    </details>
  );
}
