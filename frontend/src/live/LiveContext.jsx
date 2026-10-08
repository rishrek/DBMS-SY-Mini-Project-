// Live updates, browser side. One connection per browser tab to the API's
// /api/live stream, shared by every block on the page. When the server says a
// table changed, the blocks that show that table fetch their data again (see
// the `live` option of useApi).
//
// Why fetch() and not the browser's EventSource: EventSource can't send the
// Authorization header, and putting the login token in the address would write
// it into the server's log.
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { API_URL } from "../lib/api";

const LiveContext = createContext(null);

// The tables the database announces (database/05_live_updates.sql).
const TABLES = ["weather_data", "region_warning", "region_forecast", "ingestion_run"];
// One data load sends a few messages within milliseconds; wait this long and refresh once.
const SETTLE_MS = 150;

// "event: change\ndata: {...}" -> { event: "change", data: {...} }
function parseEvent(text) {
  let event = "message";
  const data = [];
  for (const line of text.split("\n")) {
    if (line.startsWith(":")) continue;                       // a comment ("still here")
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  if (data.length === 0) return null;
  try {
    return { event, data: JSON.parse(data.join("\n")) };
  } catch {
    return null;
  }
}

export function LiveProvider({ children }) {
  const { token, logout } = useAuth();
  const [status, setStatus] = useState("connecting");        // "live" | "connecting" | "offline"
  const [versions, setVersions] = useState({});              // { weather_data: 3, ... }: +1 per change
  const [nextUpdate, setNextUpdate] = useState(null);         // when the server's 15-minute job runs next

  useEffect(() => {
    if (!token) return undefined;
    let controller = null;
    let retryTimer = null;
    let settleTimer = null;
    let changed = new Set();
    let failures = 0;
    let stopped = false;
    // Has this page been away (offline, or in a background tab) since it loaded its data?
    let wasAway = document.hidden;

    // Collect the changed tables for a moment, then bump their versions together.
    const markChanged = (table) => {
      (table === "all" ? TABLES : [table]).forEach((t) => changed.add(t));
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        const tables = changed;
        changed = new Set();
        setVersions((v) => {
          const next = { ...v };
          tables.forEach((t) => { next[t] = (next[t] ?? 0) + 1; });
          return next;
        });
      }, SETTLE_MS);
    };

    const handle = (message) => {
      if (message.event === "hello") {
        failures = 0;
        setStatus("live");
        if (wasAway) markChanged("all");                     // back after a gap: catch up on anything missed
        wasAway = false;
      } else if (message.event === "change") {
        markChanged(message.data.table);
      }
      if ("next_update" in message.data) setNextUpdate(message.data.next_update);
    };

    async function connect() {
      controller = new AbortController();
      try {
        const response = await fetch(`${API_URL}/api/live`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
          signal: controller.signal,
        });
        if (response.status === 401) {                        // the login expired: the page guard shows the login page
          logout();
          return;
        }
        if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
        // Read the stream piece by piece. Messages end with a blank line ("\n\n").
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          let end;
          while ((end = buffer.indexOf("\n\n")) !== -1) {
            const message = parseEvent(buffer.slice(0, end));
            buffer = buffer.slice(end + 2);
            if (message) handle(message);
          }
        }
      } catch (err) {
        if (err.name === "AbortError") return;                // we closed it ourselves
      }
      if (stopped || controller.signal.aborted) return;
      // The stream ended or failed (server restarting?): try again after 1 s, 2 s, 4 s ... at most 15 s.
      failures += 1;
      wasAway = true;
      setStatus(failures >= 3 ? "offline" : "connecting");
      retryTimer = setTimeout(connect, Math.min(1000 * 2 ** (failures - 1), 15000));
    }

    function disconnect() {
      clearTimeout(retryTimer);
      controller?.abort();
    }

    // A tab in the background doesn't need updates: close the stream, and reconnect
    // (and catch up) when it is shown again. This also keeps many open tabs from
    // using up the browser's few connections to the server.
    function onVisibilityChange() {
      if (document.hidden) {
        disconnect();
        wasAway = true;
        setStatus("connecting");
      } else {
        disconnect();                                          // never two streams at once
        failures = 0;
        connect();
      }
    }

    if (!document.hidden) connect();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearTimeout(settleTimer);
      disconnect();
    };
  }, [token, logout]);

  const value = useMemo(() => ({ status, versions, nextUpdate }), [status, versions, nextUpdate]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

// { status, versions, nextUpdate }, or null outside a LiveProvider (e.g. the landing page).
export function useLive() {
  return useContext(LiveContext);
}
