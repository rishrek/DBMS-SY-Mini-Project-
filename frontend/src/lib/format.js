// Formatting helpers. Readings are stored in IST WITHOUT a time zone
// ("2026-09-29T23:00:00"), so we format them as-is (as if UTC) to show the
// same clock time everywhere; timestamps WITH a zone (issued_at) are shown in IST.

const naive = (s) => new Date(`${s.length === 10 ? `${s}T00:00:00` : s}Z`);
const fmt = (opts) => new Intl.DateTimeFormat("en-IN", { timeZone: "UTC", ...opts });

export const fmtDate = (s) => (s ? fmt({ day: "numeric", month: "short", year: "numeric" }).format(naive(s)) : "–");
export const fmtDay = (s) => fmt({ weekday: "short" }).format(naive(s));
export const fmtDayMonth = (s) => fmt({ day: "numeric", month: "short" }).format(naive(s));
export const fmtReading = (s) =>
  s ? fmt({ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(naive(s)) : "–";
export const fmtHour = (s) => fmt({ hour: "2-digit", minute: "2-digit", hour12: false }).format(naive(s));

// A timestamp that carries its own zone (e.g. issued_at), shown in IST.
export const fmtStamp = (s) =>
  s
    ? new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata", day: "numeric", month: "short",
        hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(new Date(s)) + " IST"
    : "–";

// A timestamp with its own zone -> just the IST clock time, e.g. "12:30"
export const fmtClock = (s) =>
  s
    ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false })
        .format(new Date(s))
    : "–";

// 27.25 -> "27.3"; null -> "–"
export function num(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "–";
  return Number(value).toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// Wind direction in degrees -> compass point (0 = from the north)
export function compass(deg) {
  if (deg === null || deg === undefined) return "–";
  const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return points[Math.round(((deg % 360) / 45)) % 8];
}

// Today's date in IST as "YYYY-MM-DD" (for date inputs)
export function todayIST() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}
