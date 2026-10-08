// The dashboard (/dashboard, login needed). It opens on the person's own area
// (APP_USER's region) and answers, in this order:
//   is there a warning today, and what does that mean for me?   (the answer card)
//   what is it like right now?                                   (the navy panel)
//   the day so far, the week ahead, wind, sun, history, the map  (the cards below)
// Every block updates by itself: `live` lists the tables whose changes it follows.
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { adviceFor, describeNow, greeting } from "../lib/advice";
import { fmtReading, num } from "../lib/format";
import { sunTimes } from "../lib/sun";
import { useApi } from "../lib/useApi";
import { useNow } from "../lib/useNow";
import { Async, EmptyState, Loading } from "../components/States";
import AllValues from "../components/AllValues";
import AreaSearch from "../components/AreaSearch";
import NowPanel from "../components/NowPanel";
import OverviewTiles from "../components/OverviewTiles";
import RecentWarnings from "../components/RecentWarnings";
import SunArc from "../components/SunArc";
import TodayHours from "../components/TodayHours";
import WarningAnswer from "../components/WarningAnswer";
import WeekForecast from "../components/WeekForecast";
import WindCompass from "../components/WindCompass";

// The map (Leaflet) and the charts (Recharts) are big libraries. Loading them
// lazily lets the answer and the panel show first; they follow a moment later.
const StationMap = lazy(() => import("../components/StationMap"));
const HistoryCharts = lazy(() => import("../components/HistoryCharts"));

// Screen readers can't see a colour change, so when the warning level of the area
// on screen changes by itself, say it once: "Update for Colaba: Orange warning."
function useLevelAnnouncement(answer) {
  const [message, setMessage] = useState("");
  const last = useRef(null);                    // { regionId, level } seen last time
  useEffect(() => {
    if (!answer) return;
    const { region_id: regionId, region, highest_level: level } = answer;
    if (last.current?.regionId === regionId && last.current.level !== level) {
      setMessage(level === "Green" ? `Update for ${region}: no warning now.` : `Update for ${region}: ${level} warning.`);
    }
    last.current = { regionId, level };
  }, [answer]);
  return message;
}

export default function HomePage() {
  const { user, isAdmin } = useAuth();          // RequireLogin guarantees a user here
  const [chosen, setChosen] = useState(null);   // another area the person picked, if any
  const regionId = chosen ?? user.region_id;
  const atHome = regionId === user.region_id;
  const now = useNow();

  const regions = useApi("/api/regions");
  const stations = useApi("/api/stations/map", { auth: true, live: ["weather_data", "region_warning"] });
  // weather_data too: at midnight the first reading of the new day starts a new "today"
  const answer = useApi(`/api/regions/${regionId}/warnings/today`, { auth: true, live: ["region_warning", "weather_data"] });
  const current = useApi(`/api/regions/${regionId}/current`, { auth: true, live: ["weather_data"] });
  const forecast = useApi(`/api/regions/${regionId}/forecast`, { auth: true, live: ["region_forecast"] });
  const today = useApi(`/api/regions/${regionId}/today`, { auth: true, live: ["weather_data"] });
  const announcement = useLevelAnnouncement(answer.data);

  const area = regions.data?.find((r) => r.region_id === regionId)?.region ?? (atHome ? user.region : "this area");
  const reading = current.data?.[0] ?? null;                 // one station per region today
  const sun = reading ? sunTimes(reading.latitude, reading.longitude, now) : null;
  const night = sun ? now < sun.sunrise || now > sun.sunset : false;
  const note = answer.data ? adviceFor({ answer: answer.data, reading, days: forecast.data, now }) : null;
  const latest = stations.data?.map((s) => s.reading_at).filter(Boolean).sort().at(-1);

  return (
    <div className="space-y-6">
      <p className="sr-only" aria-live="polite">{announcement}</p>

      {/* Hello, and which area we're looking at */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xl font-semibold text-ink">{greeting(now)}, {user.name.split(" ")[0]}.</p>
          <p className="text-ink-2">
            {describeNow(reading, area, night, now)}
            {!atHome && ` Your own area is ${user.region}.`}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          {regions.data && (
            <AreaSearch regions={regions.data} currentName={area}
                        onPick={(id) => setChosen(id === user.region_id ? null : id)} />
          )}
          {!atHome && (
            <button type="button" onClick={() => setChosen(null)} className="text-sm font-semibold text-accent hover:underline">
              Back to {user.region}
            </button>
          )}
        </div>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 xl:col-start-1">
          <Async state={answer} loadingLabel="Checking today's warnings…" height="h-40">
            {(a) => <WarningAnswer answer={a} showSource={isAdmin} note={note} />}
          </Async>
        </div>

        {/* The navy panel: beside everything on wide screens (and stays in view), second on phones */}
        <aside className="xl:sticky xl:top-6 xl:col-start-2 xl:row-span-2 xl:row-start-1">
          <Async state={current} loadingLabel="Looking outside…" height="h-96">
            {() => <NowPanel area={area} reading={reading} days={forecast.data ?? []} now={now} night={night} />}
          </Async>
        </aside>

        <div className="min-w-0 space-y-6 xl:col-start-1">
          <Async state={current} loadingLabel="Gathering today's numbers…" isEmpty={(d) => d.length === 0}
                 empty={<EmptyState title={`No readings yet for ${area}`}
                                    hint="New readings arrive every 15 minutes, and this page will show them by itself." />}>
            {() => <OverviewTiles reading={reading} />}
          </Async>

          <Async state={today} loadingLabel="Looking back over today…" height="h-44">
            {(hours) => <TodayHours hours={hours} reading={reading} sun={sun} />}
          </Async>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
            <Async state={forecast} loadingLabel="Reading the forecast…" height="h-80" isEmpty={(d) => d.length === 0}
                   empty={<EmptyState title="No forecast yet" hint="Forecasts are refreshed every hour." />}>
              {(days) => <WeekForecast days={days} />}
            </Async>
            {reading && (
              <div className="space-y-6">
                <WindCompass speed={reading.wind_speed} direction={reading.wind_direction} />
                {sun && <SunArc sun={sun} now={now} />}
              </div>
            )}
          </div>

          <Suspense fallback={<Loading label="Loading the charts…" height="h-80" />}>
            <HistoryCharts regionId={regionId} />
          </Suspense>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <div className="min-w-0">
              <Async state={stations} loadingLabel="Loading the map…" height="h-[420px]">
                {(list) => (
                  <Suspense fallback={<Loading label="Loading the map…" height="h-[420px]" />}>
                    <StationMap stations={list} selectedRegionId={regionId} onSelectRegion={(id) => setChosen(id === user.region_id ? null : id)} />
                  </Suspense>
                )}
              </Async>
              {stations.data && (
                <p className="mt-2 px-1 text-xs text-ink-2">
                  Latest reading {fmtReading(latest ?? "")} IST. {num(stations.data.filter((s) => s.warning_level !== "Green").length, 0)} of{" "}
                  {stations.data.length} places are under a warning today.
                </p>
              )}
            </div>
            <RecentWarnings area={user.region} />
          </div>

          {current.data?.length > 0 && <AllValues rows={current.data} />}
        </div>
      </div>
    </div>
  );
}
