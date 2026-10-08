// "● Live · next update around 12:30 IST": whether this page is receiving live
// updates. The words always say it too, so nothing depends on the dot's colour.
import { useLive } from "../live/LiveContext";
import { fmtClock } from "../lib/format";

const LOOKS = {
  live: { dot: "bg-level-green motion-safe:animate-pulse", text: "Live" },
  connecting: { dot: "bg-level-yellow", text: "Reconnecting…" },
  offline: { dot: "bg-muted", text: "Can't reach the server right now. Showing the last update, trying again." },
};

export default function LiveBadge({ className = "" }) {
  const live = useLive();
  if (!live) return null;
  const look = LOOKS[live.status] ?? LOOKS.connecting;
  return (
    <p className={`flex items-center gap-2 text-sm text-ink-2 ${className}`}>
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${look.dot}`} />
      <span>
        {/* Only the status word is a live region, so screen readers hear "Reconnecting…"
            and "Live", not every new "next update" time. */}
        <span role="status" className="font-medium text-ink">{look.text}</span>
        {live.status === "live" && live.nextUpdate && <> · next update around {fmtClock(live.nextUpdate)} IST</>}
      </span>
    </p>
  );
}
