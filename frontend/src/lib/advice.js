// Plain-words helpers for the dashboard: turning numbers into sentences people
// can act on. Every rule is a simple threshold, written out so it can be read
// (and argued with) in one go.
import { KIND_WORDS, weatherKind } from "./weather";

// The hour of the day in India, 0-23.
export function hourInIndia(now = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "numeric", hourCycle: "h23" }).format(now));
}

function partOfDay(hour) {
  if (hour < 5) return "night";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 20) return "evening";
  return "night";
}

export function greeting(now = new Date()) {
  const hour = hourInIndia(now);
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

function feelWord(temp) {
  if (temp == null) return "";
  if (temp < 15) return "cold";
  if (temp < 22) return "cool";
  if (temp < 28) return "pleasant";
  if (temp < 33) return "warm";
  if (temp < 38) return "hot";
  return "very hot";
}

// "It's a warm, partly cloudy afternoon in Colaba."
export function describeNow(reading, area, night, now = new Date()) {
  if (!reading) return `We're waiting for the first reading in ${area}.`;
  const kind = weatherKind(reading.current_conditions);
  const sky = night && kind === "clear" ? "clear" : KIND_WORDS[kind];
  const part = night ? "night" : partOfDay(hourInIndia(now));
  const words = [feelWord(reading.feels_like ?? reading.current_temp), sky].filter(Boolean).join(", ");
  const article = /^[aeiou]/.test(words) ? "an" : "a";
  return `It's ${article} ${words} ${part} in ${area}.`;
}

// Beaufort scale words for a wind speed in km/h.
export function beaufort(kmh) {
  if (kmh == null) return "no wind reading";
  const steps = [[1, "calm"], [6, "light air"], [12, "light breeze"], [20, "gentle breeze"], [29, "moderate breeze"],
    [39, "fresh breeze"], [50, "strong breeze"], [62, "near gale"], [75, "gale"]];
  return (steps.find(([limit]) => kmh < limit) ?? [0, "strong gale"])[1];
}

const DIRECTIONS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
// Wind direction in degrees (where it blows FROM) -> "west"
export function windFrom(deg) {
  if (deg == null) return null;
  return DIRECTIONS[Math.round((deg % 360) / 45) % 8];
}

// "The humid air makes it feel warmer."
export function feelsLikeNote(temp, feels) {
  if (temp == null || feels == null) return "";
  if (feels - temp >= 2) return "The humid air makes it feel warmer.";
  if (temp - feels >= 2) return "The wind makes it feel cooler.";
  return "It feels about the same as it reads.";
}

// What a CPCB band means for a day out.
export const AIR_ADVICE = {
  Good: "Clean air. Enjoy it.",
  Satisfactory: "Fine for almost everyone.",
  Moderate: "People with asthma may notice it.",
  Poor: "Keep long walks short today.",
  "Very Poor": "Wear a mask outdoors.",
  Severe: "Stay indoors if you can.",
};

// One sentence: "what does today mean for me?" After 6 pm most of today is over,
// so the rain advice looks at tomorrow's forecast instead.
export function adviceFor({ answer, reading, days, now = new Date() }) {
  if (answer?.has_warning) {
    const hazard = answer.warnings.find((w) => w.warning_level !== "Green")?.hazard ?? "weather";
    return `Please take the ${hazard.toLowerCase()} warning seriously and check back here. We update every 15 minutes.`;
  }
  if (!reading) return "We'll have advice for you as soon as the first reading arrives.";
  const evening = hourInIndia(now) >= 18;
  const ahead = evening ? days?.[1] : days?.[0];
  const when = evening ? "tomorrow" : "later today";
  if (reading.prec_intensity > 0) return "It's raining right now. Roads may be slippery, so go gently.";
  if (ahead?.rain_probability >= 60) return `Keep an umbrella handy. Rain is likely ${when}.`;
  if ((reading.feels_like ?? reading.current_temp) >= 38) return "It's very hot out there. Drink water and rest in the shade.";
  if (reading.aqi > 200) return "The air is poor today. A mask helps if you're outdoors for long.";
  if (reading.aqi <= 100 && (ahead?.rain_probability ?? 0) < 30) {
    return evening ? "A calm evening. Tomorrow looks dry and the air is clean." : "A good day to be outdoors. The air is clean and rain is unlikely.";
  }
  return "Nothing to worry about. We'll tell you here if that changes.";
}
