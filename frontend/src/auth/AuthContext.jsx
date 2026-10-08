// Who is logged in. The login token is kept in localStorage so a page refresh
// doesn't log you out; the user's details are re-checked with /api/auth/me.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "../lib/api";

const AuthContext = createContext(null);
const TOKEN_KEY = "climate.token";

function readToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null; // private window or blocked storage: just stay logged out
  }
}
function writeToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(readToken);
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(() => Boolean(readToken()));

  // Whenever the token changes, ask the API who it belongs to.
  useEffect(() => {
    if (!token) {
      setUser(null);
      setChecking(false);
      return undefined;
    }
    const controller = new AbortController();
    setChecking(true);
    apiFetch("/api/auth/me", { token, signal: controller.signal })
      .then((me) => setUser(me))
      .catch((err) => {
        if (err.name === "AbortError") return;
        if (err.status === 401) {          // expired or invalid: forget it
          writeToken(null);
          setToken(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, [token]);

  const login = useCallback(async (email, password) => {
    const data = await apiFetch("/api/auth/login", { method: "POST", form: { username: email, password } });
    writeToken(data.access_token);
    setUser(data.user);
    setToken(data.access_token);
    return data.user;
  }, []);

  const register = useCallback(async (fields) => {
    await apiFetch("/api/auth/register", { method: "POST", json: fields });
    return login(fields.email, fields.password);
  }, [login]);

  const logout = useCallback(() => {
    writeToken(null);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ token, user, checking, isAdmin: user?.role === "admin", login, register, logout }),
    [token, user, checking, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
