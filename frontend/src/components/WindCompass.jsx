// The wind as a compass: the arrow points where the wind is blowing TO, the
// speed sits in the middle, and the sentence says it in words.
// wind_direction is stored as the direction the wind comes FROM (0 = from the north).
import { beaufort, windFrom } from "../lib/advice";
import { num } from "../lib/format";

const SIZE = 220;
const C = SIZE / 2;

export default function WindCompass({ speed, direction }) {
  const ticks = Array.from({ length: 72 }, (_, i) => i * 5);     // a tick every 5 degrees
  const from = windFrom(direction);
  const word = beaufort(speed);

  return (
    <section aria-labelledby="wind-heading" className="card p-5">
      <h2 id="wind-heading" className="font-semibold text-ink">Wind</h2>
      <p className="text-sm text-ink-2">{word[0].toUpperCase() + word.slice(1)}{from ? ` from the ${from}` : ""}.</p>
      <div className="relative mx-auto mt-3 w-full max-w-[220px]">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" className="w-full"
             aria-label={`Wind ${num(speed, 0)} km per hour${from ? `, from the ${from}` : ""}`}>
          {ticks.map((deg) => {
            const major = deg % 90 === 0;
            const r1 = major ? 86 : 92;
            const a = ((deg - 90) * Math.PI) / 180;
            return (
              <line key={deg} x1={C + r1 * Math.cos(a)} y1={C + r1 * Math.sin(a)} x2={C + 100 * Math.cos(a)} y2={C + 100 * Math.sin(a)}
                    stroke={major ? "#0f2a44" : "#c4cbd8"} strokeWidth={major ? 2.5 : 1.2} strokeLinecap="round" />
            );
          })}
          {[["N", 0], ["E", 90], ["S", 180], ["W", 270]].map(([label, deg]) => {
            const a = ((deg - 90) * Math.PI) / 180;
            return (
              <text key={label} x={C + 70 * Math.cos(a)} y={C + 70 * Math.sin(a)} textAnchor="middle" dominantBaseline="central"
                    className="fill-ink-2 text-[13px] font-semibold">{label}</text>
            );
          })}
          {direction != null && (
            // the arrow, turned to where the wind goes (from + 180°)
            <g transform={`rotate(${direction + 180} ${C} ${C})`}>
              <line x1={C} y1={C + 52} x2={C} y2={C - 52} stroke="#2f6be0" strokeWidth="3" strokeLinecap="round" />
              <path d={`M ${C} ${C - 62} L ${C - 9} ${C - 44} L ${C + 9} ${C - 44} Z`} fill="#2f6be0" />
              <circle cx={C} cy={C + 54} r="4.5" fill="#fdfdfe" stroke="#2f6be0" strokeWidth="2.5" />
            </g>
          )}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="grid size-[86px] place-items-center rounded-full bg-surface text-center shadow-card">
            <span className="leading-none">
              <span className="block text-2xl font-bold text-ink tabular">{num(speed, 0)}</span>
              <span className="text-xs text-ink-2">km/h</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
