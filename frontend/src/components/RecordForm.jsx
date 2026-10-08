// A form built from the Pydantic JSON schema that the backend sends for each
// table (GET /api/admin/tables), so the form always matches what the API accepts.
// Value RULES (ranges, allowed words, uniqueness) are checked by the database;
// if it refuses, the page shows which constraint said no.
import { useState } from "react";
import { inputClass } from "../lib/ui";

// Columns that only allow a few values get a drop-down.
const CHOICES = {
  role: ["user", "admin"],
  warning_level: ["Yellow", "Orange", "Red"],
  prec_type: ["None", "Rain", "Showers", "Snow"],
};

function schemaFields(schema) {
  return Object.entries(schema.properties).map(([name, prop]) => {
    const variants = prop.anyOf ?? [prop];
    const main = variants.find((v) => v.type !== "null") ?? {};
    return {
      name,
      type: main.type,                       // "integer" | "number" | "string"
      format: main.format,                   // "date" | "time" | "email" | undefined
      nullable: variants.some((v) => v.type === "null"),
      required: schema.required?.includes(name) ?? false,
      def: prop.default,
    };
  });
}

const label = (name) => name.replaceAll("_", " ");

function initialValues(fields, row) {
  const values = {};
  fields.forEach((f) => {
    let v = row ? row[f.name] : f.def;
    if (f.name === "password") v = "";
    if (f.format === "time" && typeof v === "string") v = v.slice(0, 5);   // "06:00:00" -> "06:00"
    values[f.name] = v === null || v === undefined ? "" : String(v);
  });
  return values;
}

// Form text -> JSON for the API: "" becomes NULL (or is left out), numbers become numbers.
function toPayload(fields, values) {
  const payload = {};
  fields.forEach((f) => {
    const raw = values[f.name];
    if (raw === "" || raw === undefined) {
      if (f.nullable) payload[f.name] = null;
      return;
    }
    if (f.type === "integer") payload[f.name] = Number.parseInt(raw, 10);
    else if (f.type === "number") payload[f.name] = Number.parseFloat(raw);
    else payload[f.name] = raw;
  });
  return payload;
}

function Input({ field, value, onChange, lookups, mode }) {
  const common = { id: `f-${field.name}`, value, onChange: (e) => onChange(e.target.value), className: inputClass };
  const optional = field.nullable || (!field.required && field.def === null);
  if (field.name === "region_id") {
    return (
      <select {...common} required={field.required}>
        <option value="">Choose…</option>
        {lookups.regions.map((r) => <option key={r.region_id} value={r.region_id}>{r.region} (id {r.region_id})</option>)}
      </select>
    );
  }
  if (field.name === "station_id") {
    return (
      <select {...common} required={field.required}>
        <option value="">Choose…</option>
        {lookups.stations.map((s) => <option key={s.station_id} value={s.station_id}>{s.station_name} (id {s.station_id})</option>)}
      </select>
    );
  }
  if (CHOICES[field.name]) {
    return (
      <select {...common} required={field.required}>
        {optional ? <option value="">(NULL)</option> : <option value="">Choose…</option>}
        {CHOICES[field.name].map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    );
  }
  if (field.name === "password") {
    return <input {...common} type="password" autoComplete="new-password" required={mode === "create"}
                  placeholder={mode === "update" ? "leave empty to keep the current password" : "at least 8 characters"} />;
  }
  if (field.format === "date") return <input {...common} type="date" required={field.required} />;
  if (field.format === "time") return <input {...common} type="time" required={field.required} />;
  if (field.type === "integer" || field.type === "number") {
    return <input {...common} type="number" step={field.type === "integer" ? 1 : "any"} required={field.required}
                  placeholder={optional ? "NULL" : ""} />;
  }
  if (/text$/.test(field.name)) return <textarea {...common} rows={2} required={field.required} />;
  return <input {...common} type={field.format === "email" ? "email" : "text"} required={field.required}
                placeholder={optional ? "NULL" : ""} />;
}

export default function RecordForm({ title, schema, row, mode, lookups, onSubmit, onCancel, busy }) {
  const fields = schemaFields(schema);
  const [values, setValues] = useState(() => initialValues(fields, row));
  const setField = (name) => (v) => setValues((prev) => ({ ...prev, [name]: v }));
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(toPayload(fields, values)); }}
          className="rounded-2xl border border-navy/30 bg-surface p-4 shadow-sm">
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => (
          <div key={f.name}>
            <label htmlFor={`f-${f.name}`} className="mb-1 block text-xs font-medium text-ink-2">
              {label(f.name)}{f.required ? " *" : ""}
            </label>
            <Input field={f} value={values[f.name]} onChange={setField(f.name)} lookups={lookups} mode={mode} />
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={busy}
                className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {busy ? "Saving…" : mode === "create" ? "Insert row" : "Save changes"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-line px-4 py-2 text-sm font-medium">
          Cancel
        </button>
      </div>
    </form>
  );
}
