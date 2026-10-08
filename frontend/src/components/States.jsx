// Loading, error and empty states, used by every block that loads data.

// A soft placeholder the shape of a card (no spinner), with a friendly line in it.
export function Loading({ label = "Loading…", height = "h-32" }) {
  return (
    <div role="status" aria-live="polite"
         className={`flex ${height} items-center justify-center rounded-[20px] bg-surface/70 text-sm text-muted motion-safe:animate-pulse`}>
      {label}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = "Something went wrong" }) {
  const db = error?.body ?? {};
  return (
    <div role="alert" className="rounded-xl border border-level-red/40 bg-[#fbe6e6] p-4 text-sm">
      <p className="font-semibold text-[#8f1f1f]">{title}</p>
      <p className="mt-1 text-ink">{error?.message ?? String(error)}</p>
      {db.sqlstate && (
        <p className="mt-2 text-xs text-ink-2">
          The database refused this: SQLSTATE <code className="font-mono">{db.sqlstate}</code>
          {db.constraint && <> · constraint <code className="font-mono">{db.constraint}</code></>}
        </p>
      )}
      {onRetry && (
        <button type="button" onClick={onRetry}
                className="mt-3 rounded-lg border border-line bg-surface px-3 py-1.5 font-medium hover:bg-page">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface p-6 text-center text-sm">
      <p className="font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 text-ink-2">{hint}</p>}
    </div>
  );
}

// <Async state={useApi(...)} isEmpty={(d) => d.length === 0} empty={<EmptyState …/>}>
//   {(data) => <Something data={data} />}
// </Async>
export function Async({ state, loadingLabel, isEmpty, empty, height, children }) {
  const { data, error, loading, reload } = state;
  if (error && data == null) return <ErrorState error={error} onRetry={reload} />;
  if (data == null) return <Loading label={loadingLabel} height={height} />;
  if (isEmpty?.(data)) return empty ?? <EmptyState title="Nothing to show yet." />;
  return (
    <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"} aria-busy={loading}>
      {error && <ErrorState error={error} onRetry={reload} title="Could not refresh (showing the last result)" />}
      {children(data)}
    </div>
  );
}
