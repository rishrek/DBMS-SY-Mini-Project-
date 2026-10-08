// Colours with a meaning. They are always shown together with a text label,
// so nothing depends on colour alone (colour-blind readers, printouts).

// IMD warning levels, in order of seriousness (same order as warning_rank() in SQL).
export const LEVELS = {
  Green: { color: "#0ca30c", tint: "#e8f6e8", rank: 0, meaning: "No warning" },
  Yellow: { color: "#fab219", tint: "#fef5de", rank: 1, meaning: "Watch: be updated" },
  Orange: { color: "#ec835a", tint: "#fdede6", rank: 2, meaning: "Alert: be prepared" },
  Red: { color: "#d03b3b", tint: "#fbe6e6", rank: 3, meaning: "Warning: take action" },
};
export const LEVEL_NAMES = ["Green", "Yellow", "Orange", "Red"];

// CPCB National AQI categories: background colour + readable text colour.
export const AQI_STYLE = {
  Good: { bg: "#00b050", fg: "#052e16" },
  Satisfactory: { bg: "#92d050", fg: "#1a2e05" },
  Moderate: { bg: "#ffff00", fg: "#3a3a00" },
  Poor: { bg: "#ff9900", fg: "#3b2300" },
  "Very Poor": { bg: "#ff0000", fg: "#ffffff" },
  Severe: { bg: "#c00000", fg: "#ffffff" },
};
export const AQI_BANDS = [
  { category: "Good", min: 0, max: 50 },
  { category: "Satisfactory", min: 51, max: 100 },
  { category: "Moderate", min: 101, max: 200 },
  { category: "Poor", min: 201, max: 300 },
  { category: "Very Poor", min: 301, max: 400 },
  { category: "Severe", min: 401, max: 500 },
];

// Chart colours: validated reference palette slots + recessive chrome.
export const SERIES = { rain: "#2a78d6", temp: "#eb6834", humid: "#1baf7a", aqi: "#2a78d6", muted: "#b9b7b0" };
export const CHROME = { grid: "#e1e0d9", axis: "#7a7872", baseline: "#c3c2b7", surface: "#fcfcfb" };
