// Shows a SQL query with light syntax colouring and a Copy button.
// The text is exactly what the backend ran (it sends the SQL with each result).
import { useState } from "react";

const KEYWORDS = new Set((
  "select from where join left right inner outer on and or not in is null as group by order having " +
  "limit offset with over partition rows between preceding following current row rank row_number " +
  "avg min max count sum round distinct union all except insert into values update set delete " +
  "returning conflict do nothing case when then else end exists filter desc asc coalesce date_trunc " +
  "to_char generate_series int4range extract epoch interval true false"
).split(" "));

// Split one line of SQL into coloured pieces (comment / string / placeholder / keyword / number).
function colour(line, lineNo) {
  const commentAt = line.indexOf("--");
  const code = commentAt >= 0 ? line.slice(0, commentAt) : line;
  const comment = commentAt >= 0 ? line.slice(commentAt) : "";
  const parts = code.split(/('(?:[^']|'')*'|%\(\w+\)s|\b\w+\b)/g).filter((p) => p !== "");
  return (
    <span key={lineNo}>
      {parts.map((p, i) => {
        if (p.startsWith("'")) return <span key={i} className="text-[#0f7b3d]">{p}</span>;
        if (p.startsWith("%(")) return <span key={i} className="rounded bg-[#efe9fb] text-[#5b3cc4]">{p}</span>;
        if (KEYWORDS.has(p.toLowerCase())) return <span key={i} className="font-semibold text-[#1c4f8f]">{p}</span>;
        if (/^\d+(\.\d+)?$/.test(p)) return <span key={i} className="text-[#a3480f]">{p}</span>;
        return p;
      })}
      {comment && <span className="italic text-[#6f6e68]">{comment}</span>}
      {"\n"}
    </span>
  );
}

export default function SqlBlock({ sql, params, title = "SQL" }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the text can still be selected by hand */
    }
  };
  const paramList = params ? Object.entries(params).filter(([, v]) => v !== null && v !== undefined) : [];
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-line bg-[#fbfaf7]">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-2">{title}</span>
        <button type="button" onClick={copy}
                className="rounded-md border border-line bg-surface px-2 py-0.5 text-xs font-medium text-ink-2 hover:text-ink">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-h-[28rem] overflow-auto p-3 font-mono text-[12.5px] leading-relaxed text-ink">
        <code>{sql.trimEnd().split("\n").map(colour)}</code>
      </pre>
      {paramList.length > 0 && (
        <div className="border-t border-line px-3 py-2 text-xs text-ink-2">
          Parameters:{" "}
          {paramList.map(([k, v]) => (
            <code key={k} className="mr-2 rounded bg-[#efe9fb] px-1 font-mono text-[#5b3cc4]">{k} = {String(v)}</code>
          ))}
        </div>
      )}
    </div>
  );
}
