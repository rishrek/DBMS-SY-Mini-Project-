// useApi("/api/regions") -> { data, error, loading, reload }
// Fetches when the path changes. While re-fetching it keeps the previous data
// on screen (the page dims slightly instead of flashing a loading skeleton).
//
// useApi(path, { auth: true, live: ["weather_data"] }) also fetches again
// whenever the server says one of those tables changed (live/LiveContext.jsx).
// Those refreshes are quiet: nothing dims, and if one fails the last data simply
// stays on screen (the Live badge shows connection trouble instead).
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useLive } from "../live/LiveContext";
import { apiFetch } from "./api";

export function useApi(path, { auth = false, live = [] } = {}) {
  const { token, logout } = useAuth();
  const liveState = useLive();
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) });
  const [version, setVersion] = useState(0);
  // A number that goes up whenever one of the `live` tables changes.
  const liveVersion = live.reduce((sum, table) => sum + (liveState?.versions[table] ?? 0), 0);
  const lastRequest = useRef(null);      // what the previous fetch was for
  const hasData = useRef(false);

  useEffect(() => {
    if (!path) {
      setState({ data: null, error: null, loading: false });
      return undefined;
    }
    // Quiet = the same request as last time, fetched again only because of a live change.
    const request = `${path}|${auth}|${token}|${version}`;
    const quiet = request === lastRequest.current && hasData.current;
    lastRequest.current = request;

    const controller = new AbortController();
    if (!quiet) setState((s) => ({ ...s, loading: true, error: null }));
    apiFetch(path, { token: auth ? token : undefined, signal: controller.signal })
      .then((data) => {
        hasData.current = true;
        setState({ data, error: null, loading: false });
      })
      .catch((error) => {
        if (error.name === "AbortError") return;
        if (error.status === 401 && auth && token) logout(); // login expired
        if (quiet) return;                                   // keep showing the last data
        setState((s) => ({ data: s.data, error, loading: false }));
      });
    return () => controller.abort();
  }, [path, auth, token, logout, version, liveVersion]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}
