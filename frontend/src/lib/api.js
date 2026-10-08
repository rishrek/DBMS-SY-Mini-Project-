// The one place that talks to the FastAPI backend.
// Change the address with a VITE_API_URL line in frontend/.env.local if needed.
export const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

// An error from the API. For database errors, `body` also carries the SQLSTATE
// code and the name of the constraint that refused the change.
export class ApiError extends Error {
  constructor(status, body) {
    super(messageFrom(status, body));
    this.status = status;
    this.body = body ?? {};
  }
}

function messageFrom(status, body) {
  const detail = body?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    // Pydantic's 422 answer: a list of {loc, msg}
    return detail.map((d) => `${d.loc?.at(-1) ?? "value"}: ${d.msg}`).join("; ");
  }
  return `Request failed (HTTP ${status})`;
}

/**
 * apiFetch("/api/regions")
 * apiFetch("/api/auth/login", { method: "POST", form: { username, password } })
 * apiFetch("/api/admin/location", { method: "POST", json: { region: "X" }, token })
 */
export async function apiFetch(path, { method = "GET", json, form, token, signal } = {}) {
  const headers = {};
  let body;
  if (json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(json);
  }
  if (form !== undefined) body = new URLSearchParams(form); // the login form
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(API_URL + path, { method, headers, body, signal });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new ApiError(0, {
      detail: `Can't reach the API at ${API_URL}. Is the backend running? ` +
        "(cd backend && .venv/bin/python -m uvicorn app.main:app --reload)",
    });
  }

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { detail: text };
  }
  if (!response.ok) throw new ApiError(response.status, data);
  return data;
}

// "/api/admin/region-warning" + ["9", "2026-07-05", "Air Quality"] -> ".../9/2026-07-05/Air%20Quality"
export function keyPath(parts) {
  return parts.map((p) => encodeURIComponent(String(p))).join("/");
}

// "?region_id=3&days=7", skipping empty values
export function query(params) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") q.set(k, v);
  });
  const s = q.toString();
  return s ? `?${s}` : "";
}
