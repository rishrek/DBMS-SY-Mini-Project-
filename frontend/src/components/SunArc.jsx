// The sun's path today as a half circle: the filled part is the daylight so far,
// the dot is where the sun is now. Times come from lib/sun.js.
import { fmtClock } from "../lib/format";
import { fromNow } from "../lib/sun";

const W = 260;
const R = 110;
const CX = W / 2;
const CY = 124;

function pointAt(t) {                     // t = 0 at sunrise, 1 at sunset
  const angle = Math.PI * (1 - t);
  return [CX + R * Math.cos(angle), CY - R * Math.sin(angle)];
}

export default function SunArc({ sun, now }) {
  const t = Math.min(1, Math.max(0, (now - sun.sunrise) / (sun.sunset - sun.sunrise)));
  const up = now >= sun.sunrise && now <= sun.sunset;
  const [sx, sy] = pointAt(t);
  const done = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${sx} ${sy} L ${sx} ${CY} Z`;

  let line;
  if (up) line = `The sun sets ${fromNow(sun.sunset, now)}.`;
  else if (now < sun.sunrise) line = `The sun rises ${fromNow(sun.sunrise, now)}.`;
  else line = "The sun has set for today.";

  return (
    <section aria-labelledby="sun-heading" className="card p-5">
      <h2 id="sun-heading" className="font-semibold text-ink">Sunrise and sunset</h2>
      <p className="text-sm text-ink-2">{line}</p>
      <svg viewBox={`0 0 ${W} 140`} className="mt-3 w-full" aria-hidden="true">
        <defs>
          <linearGradient id="daylight" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f6b34a" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#f6b34a" stopOpacity="0.08" />
          </linearGradient>
        </defs>
        <path d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`} fill="none" stroke="#f2a93b"
              strokeWidth="2" strokeDasharray="5 6" />
        {up && t > 0 && <path d={done} fill="url(#daylight)" />}
        <line x1="8" y1={CY} x2={W - 8} y2={CY} stroke="#d5dbe5" strokeWidth="1.5" />
        {up && <circle cx={sx} cy={sy} r="9" fill="#f6b34a" stroke="#fdfdfe" strokeWidth="3" />}
      </svg>
      <div className="mt-2 flex justify-between text-sm">
        <span><span className="block text-ink-2">Sunrise</span><span className="font-semibold text-ink tabular">{fmtClock(sun.sunrise)}</span></span>
        <span className="text-right"><span className="block text-ink-2">Sunset</span><span className="font-semibold text-ink tabular">{fmtClock(sun.sunset)}</span></span>
      </div>
    </section>
  );
}
