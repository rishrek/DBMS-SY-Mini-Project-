// The frame around the logged-in pages: a sidebar with the menu (a top bar with a
// Menu button on phones), a slim bar with today's date and the Live line, then the page.
// Also the two gatekeepers used in App.jsx:
//   RequireLogin  the dashboard: not logged in -> the login page (and back afterwards)
//   RequireAdmin  the team's pages: anyone who isn't an admin gets the ordinary
//                 "page not found", so nobody can tell these pages exist
// (The API enforces the same rules; these only decide what the browser shows.)
import { Suspense, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from "react-router";
import {
  CalendarBlank, ChartLine, ChartLineUp, Database, List, MapTrifold, ShieldCheck, SignOut, SquaresFour, X,
} from "@phosphor-icons/react";
import { useAuth } from "../auth/AuthContext";
import { LiveProvider } from "../live/LiveContext";
import NotFoundPage from "../pages/NotFoundPage";
import LiveBadge from "./LiveBadge";
import { Loading } from "./States";

// The bar's page name. The team's pages print their own heading, so only the dashboard needs one here.
const TITLES = { "/dashboard": "Dashboard" };

const linkLook = (active) =>
  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
    active ? "bg-navy text-white" : "text-ink-2 hover:bg-page hover:text-ink"}`;

function NavItem({ to, label, icon: Icon, onClick }) {
  return (
    <NavLink to={to} onClick={onClick} className={({ isActive }) => linkLook(isActive)}>
      <Icon size={20} weight="duotone" aria-hidden="true" /> {label}
    </NavLink>
  );
}

// Jumps to a part of the dashboard (#week, #map, #history).
function JumpItem({ href, label, icon: Icon, onClick }) {
  return (
    <a href={href} onClick={onClick} className={`${linkLook(false)} py-2 pl-9`}>
      <Icon size={18} weight="duotone" aria-hidden="true" /> {label}
    </a>
  );
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

function UserChip({ compact = false }) {
  const { user, isAdmin } = useAuth();
  if (!user) return null;
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/10 text-sm font-bold text-accent">
        {initials(user.name)}
      </span>
      {!compact && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold text-ink">{user.name}</span>
          <span className="block truncate text-xs text-ink-2">{user.region}{isAdmin ? " (admin)" : ""}</span>
        </span>
      )}
    </div>
  );
}

// The menu itself: the same in the sidebar and in the phone menu.
function Menu({ onNavigate }) {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const onDashboard = location.pathname === "/dashboard";

  if (!user) {
    return (
      <div className="flex flex-col gap-2">
        <Link to="/login" onClick={onNavigate}
              className="rounded-xl border border-line px-3 py-2.5 text-center text-sm font-semibold text-ink hover:bg-page">Log in</Link>
        <Link to="/register" onClick={onNavigate}
              className="rounded-xl bg-navy px-3 py-2.5 text-center text-sm font-semibold text-white hover:bg-navy/90">Create your account</Link>
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col">
      <nav aria-label="Main" className="flex flex-col gap-1">
        <NavItem to="/dashboard" label="Dashboard" icon={SquaresFour} onClick={onNavigate} />
        {onDashboard && (
          <>
            <JumpItem href="#week" label="This week" icon={CalendarBlank} onClick={onNavigate} />
            <JumpItem href="#map" label="Map" icon={MapTrifold} onClick={onNavigate} />
            <JumpItem href="#history" label="History" icon={ChartLine} onClick={onNavigate} />
          </>
        )}
        {isAdmin && (
          <>
            <p className="mt-5 px-3 pb-1 text-xs font-semibold text-muted">For the team</p>
            <NavItem to="/analytics" label="Analytics" icon={ChartLineUp} onClick={onNavigate} />
            <NavItem to="/integrity" label="Integrity" icon={ShieldCheck} onClick={onNavigate} />
            <NavItem to="/admin" label="Admin" icon={Database} onClick={onNavigate} />
          </>
        )}
      </nav>
      <div className="mt-auto space-y-3 border-t border-line pt-4">
        <UserChip />
        {/* Go to the landing page first; it logs out once it's on screen. (Logging out
            right here would make this page's guard jump to the login page first.) */}
        <button type="button" onClick={() => { onNavigate?.(); navigate("/", { state: { logout: true } }); }}
                className={`${linkLook(false)} w-full`}>
          <SignOut size={20} weight="duotone" aria-hidden="true" /> Log out
        </button>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <Link to="/" className="flex min-w-0 items-center gap-3">
      <img src="/favicon.svg" alt="" className="size-9 shrink-0" />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[15px] font-bold text-ink">Climate Intelligence</span>
        <span className="block truncate text-xs text-ink-2">The right warning, the right place</span>
      </span>
    </Link>
  );
}

function todayLong() {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long", day: "numeric", month: "long", year: "numeric" })
    .format(new Date());
}

export default function Layout() {
  const { user } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);
  const title = TITLES[`/${location.pathname.split("/")[1]}`];

  return (
    <LiveProvider>
      <div className="min-h-[100dvh] bg-page lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
        {/* Sidebar (large screens) */}
        <aside className="sticky top-0 hidden h-[100dvh] flex-col gap-7 border-r border-line bg-surface px-4 py-6 lg:flex">
          <div className="px-1"><Brand /></div>
          <Menu />
        </aside>

        {/* Top bar with a Menu button (phones and tablets) */}
        <header className="sticky top-0 z-[1100] border-b border-line bg-surface/95 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <Brand />
            <button type="button" aria-expanded={menuOpen} aria-controls="phone-menu" onClick={() => setMenuOpen((o) => !o)}
                    className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-medium text-ink">
              {menuOpen ? <X size={18} aria-hidden="true" /> : <List size={18} aria-hidden="true" />}
              {menuOpen ? "Close" : "Menu"}
            </button>
          </div>
          {menuOpen && (
            <div id="phone-menu" className="flex max-h-[75dvh] flex-col overflow-y-auto border-t border-line px-4 pb-4 pt-3">
              <Menu onNavigate={close} />
            </div>
          )}
        </header>

        <div className="flex min-w-0 flex-col">
          {/* Today's date, the page's name and the Live line */}
          {user && (
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 pt-5 sm:px-6 lg:px-8 lg:pt-7">
              <div>
                <p className="text-sm text-ink-2">{todayLong()}</p>
                {title && <p className="text-2xl font-bold tracking-tight text-ink">{title}</p>}
              </div>
              <div className="flex items-center gap-5">
                <LiveBadge />
                <span className="hidden sm:block lg:hidden"><UserChip compact /></span>
              </div>
            </div>
          )}

          <main className="w-full flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
            {/* Shown while a page's code is downloading (pages are loaded lazily) */}
            <Suspense fallback={<Loading label="Loading the page…" />}>
              <Outlet />
            </Suspense>
          </main>

          <footer className="px-4 pb-6 text-xs leading-relaxed text-ink-2 sm:px-6 lg:px-8">
            <p>
              Weather and air-quality data:{" "}
              <a className="underline hover:text-ink" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo.com</a>{" "}
              (CC BY 4.0). Map © <a className="underline hover:text-ink" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors.
              Our warnings follow simplified IMD-style rules and are not official IMD warnings.
            </p>
            <p className="mt-1">KJS-CES-01, a DBMS project by Aatharva, Risheek B and Anush, K J Somaiya School of Engineering.</p>
          </footer>
        </div>
      </div>
    </LiveProvider>
  );
}

// The dashboard: log in first, then come straight back here.
export function RequireLogin({ children }) {
  const { user, checking } = useAuth();
  const location = useLocation();
  if (checking) return <Loading label="Checking your login…" />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  return children;
}

// The team's pages (used as a parent route): admins get them, everyone else
// sees the same "page not found" as for a mistyped address.
export function RequireAdmin() {
  const { isAdmin, checking } = useAuth();
  if (checking) return <Loading label="Checking your login…" />;
  return isAdmin ? <Outlet /> : <NotFoundPage />;
}
