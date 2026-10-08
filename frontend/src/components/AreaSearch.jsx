// "Search for an area": type a few letters and pick one. A real combobox, so it
// also works with the keyboard (up/down to move, Enter to pick, Escape to close)
// and with screen readers.
import { useId, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";

export default function AreaSearch({ regions, currentName, onPick }) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const matches = regions.filter((r) => r.region.toLowerCase().includes(text.trim().toLowerCase()));

  const pick = (r) => {
    onPick(r.region_id);
    setText("");
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && open && matches[active]) { e.preventDefault(); pick(matches[active]); }
    else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div className="relative w-full sm:w-72">
      <label htmlFor={`${listId}-input`} className="sr-only">Search for an area</label>
      <MagnifyingGlass size={18} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
      <input id={`${listId}-input`} type="text" role="combobox" autoComplete="off"
             aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
             aria-activedescendant={open && matches[active] ? `${listId}-${matches[active].region_id}` : undefined}
             value={text} placeholder={`Search an area (now: ${currentName})`}
             onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0); }}
             onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 120)} onKeyDown={onKeyDown}
             className="w-full rounded-xl border border-line bg-surface py-2.5 pl-10 pr-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25" />
      {open && (
        <ul id={listId} role="listbox" className="card absolute z-[1050] mt-2 max-h-72 w-full overflow-y-auto p-1.5">
          {matches.length === 0 && <li className="px-3 py-2 text-sm text-ink-2">No area called "{text}". We cover ten places.</li>}
          {matches.map((r, i) => (
            <li key={r.region_id} id={`${listId}-${r.region_id}`} role="option" aria-selected={i === active}
                onMouseDown={(e) => { e.preventDefault(); pick(r); }} onMouseEnter={() => setActive(i)}
                className={`cursor-pointer rounded-lg px-3 py-2 text-sm ${i === active ? "bg-page text-ink" : "text-ink-2"}`}>
              {r.region}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
