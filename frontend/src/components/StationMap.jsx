// Map of Maharashtra with every station coloured by its region's warning level
// today (like Fig. 1 on the poster). Click a station for its latest reading.
import { useEffect, useRef } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import { LEVELS, LEVEL_NAMES } from "../lib/colors";
import { fmtReading, num } from "../lib/format";
import { AqiBadge, LevelChip, LevelDot } from "./Badges";

// Zoom to fit all stations once, when they first load.
function FitOnce({ stations }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || stations.length === 0) return;
    map.fitBounds(stations.map((s) => [s.latitude, s.longitude]), { padding: [36, 36] });
    done.current = true;
  }, [map, stations]);
  return null;
}

// Two zoom buttons. Five stations sit close together around Mumbai, so, like the
// inset in Fig. 1 of our poster, one button zooms into the Mumbai area.
const MUMBAI = [[18.55, 72.75], [19.3, 73.1]];
function ZoomButtons({ stations }) {
  const map = useMap();
  const all = () => map.flyToBounds(stations.map((s) => [s.latitude, s.longitude]), { padding: [36, 36], duration: 0.6 });
  const mumbai = () => map.flyToBounds(MUMBAI, { duration: 0.6 });
  const button = "rounded-md border border-line bg-surface px-2 py-1 text-xs font-medium text-ink shadow-sm hover:bg-page";
  return (
    <div className="absolute right-3 top-3 z-[1000] flex gap-1">
      <button type="button" className={button} onClick={all}>All stations</button>
      <button type="button" className={button} onClick={mumbai}>Mumbai area</button>
    </div>
  );
}

export default function StationMap({ stations, selectedRegionId, onSelectRegion }) {
  return (
    <section id="map" aria-labelledby="map-heading" className="card scroll-mt-24 p-5">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 id="map-heading" className="font-semibold">Stations and today's warnings</h2>
        <span className="text-xs text-ink-2">{stations.length} stations</span>
      </div>

      <div className="relative h-[340px] overflow-hidden rounded-xl border border-line md:h-[440px]">
        <MapContainer center={[19.3, 75.3]} zoom={6} scrollWheelZoom={false} className="h-full w-full">
          <TileLayer
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          <FitOnce stations={stations} />
          <ZoomButtons stations={stations} />
          {stations.map((s) => {
            const selected = s.region_id === selectedRegionId;
            return (
              <CircleMarker
                key={s.station_id}
                center={[s.latitude, s.longitude]}
                radius={selected ? 12 : 9}
                pathOptions={{
                  fillColor: LEVELS[s.warning_level]?.color ?? "#898781",
                  fillOpacity: 1,
                  color: selected ? "#0b0b0b" : "#fcfcfb",   // a ring keeps overlapping dots apart
                  weight: selected ? 3 : 2,
                }}
              >
                <Tooltip direction="top" offset={[0, -8]}>{s.station_name} · {s.warning_level}</Tooltip>
                <Popup>
                  <div className="min-w-48 space-y-1.5 text-sm">
                    <p className="font-semibold">{s.station_name}</p>
                    <p className="text-xs text-ink-2">Region {s.region} · {num(s.altitude, 0)} m above sea level</p>
                    <LevelChip level={s.warning_level} />
                    {s.reading_at ? (
                      <>
                        <p className="text-xs text-ink-2">Reading of {fmtReading(s.reading_at)} IST</p>
                        <p><span className="font-semibold">{num(s.current_temp)} °C</span> · {s.current_conditions} · humidity {s.humidity}%</p>
                        <AqiBadge aqi={s.aqi} category={s.aqi_category} />
                      </>
                    ) : (
                      <p className="text-xs text-ink-2">No readings yet for this station.</p>
                    )}
                    {!selected && (
                      <button type="button" onClick={() => onSelectRegion(s.region_id)}
                              className="mt-1 w-full rounded-md bg-navy px-2 py-1 text-xs font-medium text-white">
                        Show {s.region} on this page
                      </button>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>

        {/* Legend on top of the map on wider screens ... */}
        <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] hidden rounded-lg border border-line bg-surface/95 px-3 py-2 text-xs shadow-sm sm:block">
          <p className="mb-1 font-semibold text-ink">IMD level today</p>
          {LEVEL_NAMES.map((l) => (
            <p key={l} className="flex items-center gap-2 text-ink-2"><LevelDot level={l} /> {l}</p>
          ))}
        </div>
      </div>
      {/* ... and as one line under the map on phones, so it doesn't cover the stations. */}
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2 sm:hidden">
        <span className="font-semibold text-ink">IMD level today:</span>
        {LEVEL_NAMES.map((l) => <span key={l} className="flex items-center gap-1.5"><LevelDot level={l} /> {l}</span>)}
      </p>

      {/* The same information as a list (keyboard- and screen-reader-friendly). */}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-ink-2 hover:text-ink">Stations as a list</summary>
        <ul className="mt-2 divide-y divide-line">
          {stations.map((s) => (
            <li key={s.station_id} className="flex items-center justify-between gap-2 py-1.5">
              <button type="button" onClick={() => onSelectRegion(s.region_id)} className="text-left hover:underline">
                {s.station_name} <span className="text-ink-2">· {s.region}</span>
              </button>
              <LevelChip level={s.warning_level} />
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
