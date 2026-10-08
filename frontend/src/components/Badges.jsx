// IMD level chips and CPCB AQI badges: colour AND text, never colour alone.
import { AQI_STYLE, LEVELS } from "../lib/colors";

export function LevelDot({ level, size = 10 }) {
  const color = LEVELS[level]?.color ?? "#898781";
  return <span aria-hidden="true" className="inline-block shrink-0 rounded-full"
               style={{ width: size, height: size, background: color }} />;
}

export function LevelChip({ level, className = "" }) {
  const info = LEVELS[level];
  return (
    // "relative" keeps the screen-reader-only text (position: absolute) inside the chip,
    // so it can't stretch the page when the chip sits in a scrolling table.
    <span className={`relative inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-medium text-ink ${className}`}>
      <LevelDot level={level} />
      {level}
      {info && <span className="sr-only"> ({info.meaning})</span>}
    </span>
  );
}

export function AqiBadge({ aqi, category, large = false }) {
  if (aqi === null || aqi === undefined) {
    return <span className="text-sm text-ink-2">AQI not available</span>;
  }
  const style = AQI_STYLE[category] ?? { bg: "#e1e0d9", fg: "#0b0b0b" };
  return (
    <span className={`inline-flex items-center gap-2 rounded-lg font-semibold ${large ? "px-3 py-1.5 text-base" : "px-2 py-0.5 text-xs"}`}
          style={{ background: style.bg, color: style.fg }}>
      <span>AQI {aqi}</span>
      <span className="font-medium">{category ?? "no band"}</span>
    </span>
  );
}

export function SourceTag({ source }) {
  return (
    <span className="rounded bg-page px-1.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-ink-2">
      {source === "admin" ? "admin" : "automatic"}
    </span>
  );
}
