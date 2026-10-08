// "Welcome back": log in, then go to the dashboard (or the page you were on).
import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { ErrorState } from "../components/States";
import { inputClass } from "../lib/ui";

// Only follow "next" to a page on this site (never to another website).
const safeNext = (next) => (next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");

export default function LoginPage() {
  const { user, checking, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const target = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!checking && user) return <Navigate to={target} replace />;   // already logged in

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      navigate(target, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
      <p className="mt-2 text-ink-2">Log in to see today's warning for your area.</p>
      <form onSubmit={submit} className="mt-6 space-y-4 rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">Email</label>
          <input id="email" type="email" autoComplete="username" required value={email}
                 onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium">Password</label>
          <input id="password" type="password" autoComplete="current-password" required value={password}
                 onChange={(e) => setPassword(e.target.value)} className={inputClass} />
        </div>
        {error && <ErrorState error={error} title="We couldn't log you in" />}
        <button type="submit" disabled={busy}
                className="w-full rounded-lg bg-navy px-4 py-2.5 font-semibold text-white hover:bg-navy/90 active:translate-y-px disabled:opacity-60">
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
      <p className="mt-4 text-sm text-ink-2">
        New here? <Link to="/register" className="font-medium text-navy underline underline-offset-2 hover:no-underline">Create your account</Link>
      </p>
    </div>
  );
}
