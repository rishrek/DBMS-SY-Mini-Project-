// "Today overview": six tiles, each a value with a short sentence saying what it means.
import { Drop, Eye, Gauge, Leaf, Umbrella, Wind } from "@phosphor-icons/react";
import { AIR_ADVICE, beaufort, windFrom } from "../lib/advice";
import { AQI_STYLE } from "../lib/colors";
import { num } from "../lib/format";

// The CPCB band as a small chip in its official colour, with its name.
function AqiBand({ category }) {
  if (!category) return null;
  const style = AQI_STYLE[category];
  return (
    <span className="mr-1 inline-block rounded-md px-1.5 py-0.5 text-xs font-semibold"
          style={{ background: style?.bg, color: style?.fg }}>{category}</span>
  );
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function visibilityWords(km) {
  if (km == null) return "";
  if (km >= 10) return "A clear view far out";
  if (km >= 4) return "A little hazy";
  return "Poor. Drive carefully";
}

function Tile({ icon: Icon, label, value, detail }) {
  return (
    <div className="card flex gap-4 p-5">
      <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">
        <Icon size={24} weight="duotone" />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-ink-2">{label}</p>
        <div className="mt-0.5 text-2xl font-semibold tracking-tight text-ink tabular">{value}</div>
        {detail && <p className="mt-1 text-sm leading-snug text-ink-2">{detail}</p>}
      </div>
    </div>
  );
}

export default function OverviewTiles({ reading: r }) {
  const from = windFrom(r.wind_direction);
  return (
    <section aria-labelledby="overview-heading">
      <h2 id="overview-heading" className="mb-3 text-lg font-semibold text-ink">Today overview</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Tile icon={Wind} label="Wind" value={`${num(r.wind_speed, 0)} km/h`}
              detail={`${cap(beaufort(r.wind_speed))}${from ? ` from the ${from}` : ""}`} />
        <Tile icon={Umbrella} label="Rain today" value={`${num(r.prec_amount)} mm`}
              detail={r.prec_intensity > 0 ? `${num(r.prec_intensity)} mm in the last hour` : "Dry in the last hour"} />
        <Tile icon={Drop} label="Humidity" value={`${num(r.humidity, 0)} %`} detail={`Dew point ${num(r.dew_point)}°`} />
        <Tile icon={Leaf} label="Air quality (AQI)" value={num(r.aqi, 0)}
              detail={<><AqiBand category={r.aqi_category} /> {AIR_ADVICE[r.aqi_category]}</>} />
        <Tile icon={Gauge} label="Pressure" value={`${num(r.pressure, 0)} hPa`} detail="At sea level" />
        <Tile icon={Eye} label="Visibility" value={`${num(r.visibility)} km`} detail={visibilityWords(r.visibility)} />
      </div>
    </section>
  );
}
