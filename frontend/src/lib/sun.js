// Sunrise and sunset for a place and a day, worked out in the browser from the
// station's latitude and longitude (we don't store them). These are NOAA's
// simplified solar equations, accurate to about a minute; good enough to say
// "sunset in 2 h 40 min".
//   sunTimes(18.90, 72.81) -> { sunrise: Date, sunset: Date } for today in India
const RAD = Math.PI / 180;

// Today's date in India, as year, month (0-11) and day.
function indianDate(now) {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now).split("-").map(Number);
  return { y, m: m - 1, d };
}

export function sunTimes(latitude, longitude, now = new Date()) {
  const { y, m, d } = indianDate(now);
  const midnightUtc = Date.UTC(y, m, d);
  const dayOfYear = Math.round((midnightUtc - Date.UTC(y, 0, 0)) / 86400000);

  // the "fractional year" g, in radians, at noon of that day
  const g = ((2 * Math.PI) / 365) * (dayOfYear - 1);
  // equation of time (minutes): how far the sun runs ahead of or behind the clock
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g)
    - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  // the sun's declination (radians): how far north or south of the equator it is overhead
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  // hour angle (degrees) at which the sun's top edge touches the horizon (90.833° allows for refraction)
  const lat = latitude * RAD;
  const cosHa = Math.cos(90.833 * RAD) / (Math.cos(lat) * Math.cos(decl)) - Math.tan(lat) * Math.tan(decl);
  const ha = Math.acos(Math.min(1, Math.max(-1, cosHa))) / RAD;

  // minutes after midnight UTC
  const sunriseMin = 720 - 4 * (longitude + ha) - eqTime;
  const sunsetMin = 720 - 4 * (longitude - ha) - eqTime;
  return { sunrise: new Date(midnightUtc + sunriseMin * 60000), sunset: new Date(midnightUtc + sunsetMin * 60000) };
}

// "in 2 h 40 min" / "3 h ago" / "in 12 min"
export function fromNow(when, now = new Date()) {
  const minutes = Math.round((when - now) / 60000);
  const abs = Math.abs(minutes);
  const text = abs < 60 ? `${abs} min` : `${Math.floor(abs / 60)} h${abs % 60 ? ` ${abs % 60} min` : ""}`;
  return minutes >= 0 ? `in ${text}` : `${text} ago`;
}
