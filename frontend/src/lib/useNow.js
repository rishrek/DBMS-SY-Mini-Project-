// The current time, refreshed every `everyMs` (default 30 s), for clocks and
// "sunset in 2 h 40 min" texts.
import { useEffect, useState } from "react";

export function useNow(everyMs = 30000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

// Readings are stored in IST without a zone ("2026-10-07T13:00:00"); this makes a real Date.
export const istDate = (s) => new Date(`${s}+05:30`);
