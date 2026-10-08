// Turns Open-Meteo's weather description (from the WMO code, e.g. "Moderate rain
// showers") into one of a few kinds, an icon and plain words. Night versions are
// used between sunset and sunrise.
import { Cloud, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Moon, Sun } from "@phosphor-icons/react";

export function weatherKind(text) {
  // Only the weather words before any comma: a forecast like "Clear sky, no rain
  // expected" must not count as rain just because it contains the word "rain".
  const t = (text ?? "").split(",")[0].toLowerCase();
  if (t.includes("thunder")) return "storm";
  if (t.includes("snow")) return "snow";
  if (t.includes("rain") || t.includes("drizzle") || t.includes("shower")) return "rain";
  if (t.includes("fog")) return "fog";
  if (t.includes("overcast")) return "cloud";
  if (t.includes("partly") || t.includes("mainly")) return "partly";
  if (t.includes("clear")) return "clear";
  return "cloud";
}

const ICONS = {
  clear: { day: Sun, night: Moon, color: "text-[#f2a93b]", nightColor: "text-[#8ea6c9]" },
  partly: { day: CloudSun, night: CloudMoon, color: "text-[#f2a93b]", nightColor: "text-[#8ea6c9]" },
  cloud: { day: Cloud, night: Cloud, color: "text-[#8a9bb3]", nightColor: "text-[#8a9bb3]" },
  rain: { day: CloudRain, night: CloudRain, color: "text-[#3a86e0]", nightColor: "text-[#3a86e0]" },
  storm: { day: CloudLightning, night: CloudLightning, color: "text-[#5c6bd6]", nightColor: "text-[#5c6bd6]" },
  fog: { day: CloudFog, night: CloudFog, color: "text-[#8a9bb3]", nightColor: "text-[#8a9bb3]" },
  snow: { day: CloudSnow, night: CloudSnow, color: "text-[#7fb2e6]", nightColor: "text-[#7fb2e6]" },
};

// <WeatherIcon text="Partly cloudy" night={false} size={40} />
// onDark: on the navy panel the icon stays light so it reads well.
export function WeatherIcon({ text, night = false, size = 32, onDark = false, className = "" }) {
  const look = ICONS[weatherKind(text)];
  const Icon = night ? look.night : look.day;
  const color = onDark ? "text-white" : night ? look.nightColor : look.color;
  return <Icon aria-hidden="true" size={size} weight="duotone" className={`${color} ${className}`} />;
}

// Words for "It's a warm, partly cloudy afternoon".
export const KIND_WORDS = {
  clear: "clear", partly: "partly cloudy", cloud: "cloudy", rain: "rainy", storm: "stormy", fog: "misty", snow: "snowy",
};
