// "Create your account": a name, an email, a password and the area you live in.
// Every new account is an ordinary user account; the area decides which
// warnings the dashboard shows first.
import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { useApi } from "../lib/useApi";
import { Async, ErrorState } from "../components/States";
import { inputClass } from "../lib/ui";

export default function RegisterPage() {
  const { user, checking, register } = useAuth();
  const navigate = useNavigate();
  const regions = useApi("/api/regions");
  const [form, setForm] = useState({ name: "", email: "", password: "", region_id: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  if (!checking && user) return <Navigate to="/dashboard" replace />;   // already logged in

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register({ ...form, email: form.email.trim(), region_id: Number(form.region_id) });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Create your account</h1>
      <p className="mt-2 text-ink-2">
        Tell us your name and where you live. We'll show your area's warning first, every time you come back.
      </p>
      <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div>
          <label htmlFor="name" className="mb-1 block text-sm font-medium">Your name</label>
          <input id="name" required maxLength={100} autoComplete="name" value={form.name} onChange={set("name")}
                 className={inputClass} />
        </div>
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">Email</label>
          <input id="email" type="email" autoComplete="email" required value={form.email} onChange={set("email")}
                 className={inputClass} />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium">Password</label>
          <input id="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72}
                 value={form.password} onChange={set("password")} className={inputClass} aria-describedby="pw-hint" />
          <p id="pw-hint" className="mt-1 text-xs text-ink-2">At least 8 characters. We never store your actual password.</p>
        </div>
        <div>
          <label htmlFor="region" className="mb-1 block text-sm font-medium">Where do you live?</label>
          <Async state={regions} loadingLabel="Loading the areas…" height="h-10">
            {(list) => (
              <select id="region" required value={form.region_id} onChange={set("region_id")} className={inputClass}>
                <option value="">Choose your area…</option>
                {list.map((r) => <option key={r.region_id} value={r.region_id}>{r.region}</option>)}
              </select>
            )}
          </Async>
        </div>
        {error && <ErrorState error={error} title="We couldn't create your account" />}
        <button type="submit" disabled={busy}
                className="w-full rounded-lg bg-navy px-4 py-2.5 font-semibold text-white hover:bg-navy/90 active:translate-y-px disabled:opacity-60">
          {busy ? "Creating your account…" : "Create your account"}
        </button>
      </form>
      <p className="mt-4 text-sm text-ink-2">
        Already have an account? <Link to="/login" className="font-medium text-navy underline underline-offset-2 hover:no-underline">Log in</Link>
      </p>
    </div>
  );
}
