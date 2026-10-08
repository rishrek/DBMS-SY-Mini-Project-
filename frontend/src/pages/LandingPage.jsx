// The landing page: what this project is, why we built it, who we are, and the
// way in (Log in / Create your account). Written for people, not for examiners,
// so there are no technical words on this page.
import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useAuth } from "../auth/AuthContext";
import WarningAnswer from "../components/WarningAnswer";
import { LevelChip } from "../components/Badges";
import { LEVELS, LEVEL_NAMES } from "../lib/colors";

// A real day from this monsoon, from the readings in our database: on 5 July
// 2026 Colaba had 218.9 mm of rain, and the trigger raised a Red rain warning
// with this advisory. Shown as an example of what the dashboard says.
const EXAMPLE_DAY = {
  region: "Colaba",
  date: "2026-07-05",
  highest_level: "Red",
  has_warning: true,
  warnings: [{
    hazard: "Rain",
    warning_level: "Red",
    advisory_text: "Extremely heavy rain: 204.5 mm or more since midnight. "
      + "Stay indoors and keep away from rivers, nullahs and hill slopes.",
    source: "auto",
    issued_at: null,
  }],
};

const PROMISES = [
  { title: "Your area comes first.",
    text: "Tell us where you live once. Every time you come back, your area's answer is the first thing you see." },
  { title: "Plain words, never colour alone.",
    text: "Every warning says what is happening and what to do, and its colour always comes with its name." },
  { title: "Fresh every 15 minutes.",
    text: "New readings arrive every 15 minutes for ten places across Maharashtra, from Nagpur to Ratnagiri and "
      + "around Mumbai. Your dashboard updates by itself, so there is nothing to refresh." },
];

const FLOW = [
  { title: "Readings arrive",
    text: "Every 15 minutes, weather and air-quality readings come in from Open-Meteo for each of the ten places." },
  { title: "Limits are checked",
    text: "Each reading is compared with safe limits: heavy rain since midnight, 40 °C heat, very poor air." },
  { title: "You see it",
    text: "If your area crosses a limit, your dashboard changes by itself within seconds, in plain words, "
      + "with what to do next." },
];

// Button looks. Each is a complete set (Tailwind doesn't let a later class in the
// list override an earlier one), with one set for the light page and one for the navy band.
const button = "inline-flex items-center justify-center rounded-lg px-5 py-3 font-semibold active:translate-y-px "
  + "focus-visible:outline-2 focus-visible:outline-offset-2 ";
const BUTTONS = {
  light: {
    primary: `${button} bg-navy text-white hover:bg-navy/90 focus-visible:outline-navy`,
    secondary: `${button} border border-ink/15 bg-surface text-ink hover:border-ink/30 focus-visible:outline-navy`,
  },
  dark: {
    primary: `${button} bg-white text-navy hover:bg-white/90 focus-visible:outline-white`,
    secondary: `${button} border border-white/40 text-white hover:border-white focus-visible:outline-white`,
  },
};

function WayIn({ user, onDark = false }) {
  const look = onDark ? BUTTONS.dark : BUTTONS.light;
  if (user) {
    return <Link to="/dashboard" className={look.primary}>Open my dashboard</Link>;
  }
  return (
    <>
      <Link to="/register" className={look.primary}>Create your account</Link>
      <Link to="/login" className={look.secondary}>Log in</Link>
    </>
  );
}

export default function LandingPage() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  // "Log out" (in the dashboard's header) brings people here first, then we log them out.
  useEffect(() => {
    if (location.state?.logout) {
      logout();
      navigate("/", { replace: true, state: null });
    }
  }, [location.state, logout, navigate]);

  return (
    <div className="min-h-[100dvh] bg-page text-ink">
      {/* Top bar: the logo, and the way in */}
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link to="/" className="flex min-w-0 items-center gap-3">
          <img src="/favicon.svg" alt="" className="size-9 shrink-0" />
          <span className="hidden font-semibold sm:inline">Climate Intelligence System</span>
          <span className="sr-only sm:hidden">Climate Intelligence System</span>
        </Link>
        <nav aria-label="Account" className="flex items-center gap-2 text-sm">
          {user ? (
            <Link to="/dashboard" className="rounded-lg bg-navy px-4 py-2 font-semibold text-white hover:bg-navy/90">
              Open my dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className="rounded-lg px-3 py-2 font-semibold text-ink hover:bg-ink/5">Log in</Link>
              <Link to="/register"
                    className="hidden rounded-lg bg-navy px-4 py-2 font-semibold text-white hover:bg-navy/90 sm:inline-flex">
                Create your account
              </Link>
            </>
          )}
        </nav>
      </header>

      <main>
        {/* Hero: the promise on the left, a real answer from this monsoon on the right */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-6 sm:px-6 md:grid-cols-[1.3fr_1fr] md:gap-14 md:pb-24 md:pt-14">
          <div>
            <h1 className="text-4xl font-bold leading-[1.08] tracking-tight text-balance md:text-[2.6rem] lg:text-[2.75rem]">
              The right weather warning, for the place you live.
            </h1>
            <p className="mt-5 max-w-[34rem] text-lg leading-relaxed text-ink-2">
              When rain warnings cover a whole district, every neighbourhood is left guessing. We tell you what
              today means for yours.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <WayIn user={user} />
            </div>
          </div>
          <figure className="min-w-0">
            <div className="rounded-[28px] bg-navy/5 p-3">{/* 28px = the card's 16px + 12px padding: concentric corners */}
              <WarningAnswer answer={EXAMPLE_DAY} headingAs="p" showTime={false} />
            </div>
            <figcaption className="mt-3 px-1 text-sm leading-relaxed text-ink-2">
              A real day from this monsoon: what the dashboard told Colaba on 5 July 2026, its wettest day of the
              season, with 218.9 mm of rain.
            </figcaption>
          </figure>
        </section>

        {/* Why: the story, told quietly */}
        <section aria-labelledby="why" className="border-y border-line bg-surface">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
            <h2 id="why" className="text-2xl font-bold tracking-tight sm:text-3xl">Why we built this</h2>
            <div className="mt-6 space-y-5 text-lg leading-relaxed text-ink-2">
              <p>
                Maharashtra lives with its weather. Mumbai still remembers 26 July 2005, the day the rain stopped
                the city. In July 2023, a hillside gave way at Irshalwadi after days of heavy rain. That April, the
                heat at an open-air gathering in Kharghar cost lives.
              </p>
              <p className="text-ink">
                Each time, the question that mattered was a local one: which area, which people, how bad? That
                question is why this project exists.
              </p>
            </div>
          </div>
        </section>

        {/* What you get: three promises, and what the colours mean */}
        <section aria-labelledby="what" className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-[1.2fr_0.8fr] md:py-24">
          <div>
            <h2 id="what" className="text-2xl font-bold tracking-tight sm:text-3xl">Made for the place you live</h2>
            <dl className="mt-8 space-y-7">
              {PROMISES.map((p) => (
                <div key={p.title}>
                  <dt className="text-lg font-semibold">{p.title}</dt>
                  <dd className="mt-1 max-w-[60ch] leading-relaxed text-ink-2">{p.text}</dd>
                </div>
              ))}
            </dl>
          </div>
          <aside aria-labelledby="colours" className="self-start rounded-2xl border border-line bg-surface p-5 sm:p-6">
            <h3 id="colours" className="font-semibold">What the colours mean</h3>
            <ul className="mt-4 space-y-3">
              {LEVEL_NAMES.map((level) => (
                <li key={level} className="flex items-center gap-3">
                  <LevelChip level={level} className="w-24 shrink-0" />
                  <span className="text-ink-2">{LEVELS[level].meaning}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm leading-relaxed text-ink-2">
              The same four colours the India Meteorological Department uses, always with their names.
            </p>
          </aside>
        </section>

        {/* How it works: one reading, three moments */}
        <section aria-labelledby="how" className="border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
            <h2 id="how" className="text-2xl font-bold tracking-tight sm:text-3xl">How it works</h2>
            <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-0">
              {FLOW.map((f, i) => (
                <li key={f.title} className="relative border-l-2 border-navy/15 pl-5 md:border-l-0 md:border-t-2 md:pl-0 md:pr-8 md:pt-6">
                  <span aria-hidden="true"
                        className="absolute -left-[7px] top-0 size-3 rounded-full bg-navy md:-top-[7px] md:left-0"
                        style={{ opacity: 0.35 + i * 0.3 }} />
                  <h3 className="font-semibold">{f.title}</h3>
                  <p className="mt-1 max-w-[34ch] leading-relaxed text-ink-2">{f.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Who we are: a short letter */}
        <section aria-labelledby="who" className="border-t border-line bg-surface">
          <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 md:py-24">
            <h2 id="who" className="text-2xl font-bold tracking-tight sm:text-3xl">Hello from the three of us</h2>
            <div className="mt-6 space-y-4 text-lg leading-relaxed text-ink-2">
              <p>
                We're Aatharva, Risheek and Anush, second-year AI &amp; Data Science students at K J Somaiya School
                of Engineering in Mumbai.
              </p>
              <p>
                This started as a poster for our database course. Somewhere along the way, it became something we
                would want our own families to check on a heavy-rain morning. We hope it helps you too.
              </p>
            </div>
            <p className="mt-8 font-semibold text-ink">Aatharva, Risheek and Anush</p>
            <p className="mt-10 rounded-2xl border border-line bg-page p-5 text-sm leading-relaxed text-ink-2">
              <span className="font-semibold text-ink">A small, honest note.</span> Our readings come from
              Open-Meteo's weather models, and our warnings follow simplified versions of IMD's rules. They are not
              official warnings. If IMD issues one for your area, please follow theirs.
            </p>
          </div>
        </section>

        {/* The way in, once more */}
        <section aria-labelledby="start" className="bg-navy text-white">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 id="start" className="text-2xl font-bold tracking-tight sm:text-3xl">
                Know what today means for your area.
              </h2>
              <p className="mt-2 text-white/75">Setting up takes about a minute.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <WayIn user={user} onDark />
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-4 py-8 text-xs leading-relaxed text-ink-2 sm:px-6">
        <p>
          Weather and air-quality data:{" "}
          <a className="underline hover:text-ink" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo.com</a>{" "}
          (CC BY 4.0). Map tiles on the dashboard: © OpenStreetMap contributors.
        </p>
        <p className="mt-1">KJS-CES-01, a DBMS project at K J Somaiya School of Engineering, Mumbai.</p>
      </footer>
    </div>
  );
}
