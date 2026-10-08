// If any part of the website crashes while drawing the page, show a calm message
// with a Reload button instead of a blank white screen. (React needs a class
// component for this: getDerivedStateFromError has no hook version.)
import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("The page crashed:", error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-page p-6 text-ink">
        <div role="alert" className="w-full max-w-md rounded-2xl border border-line bg-surface p-6">
          <h1 className="text-xl font-semibold">Something went wrong on this page</h1>
          <p className="mt-2 leading-relaxed text-ink-2">
            Please reload it. If it keeps happening, tell the team what you were doing.
          </p>
          <button type="button" onClick={() => window.location.reload()}
                  className="mt-4 rounded-lg bg-navy px-4 py-2 font-semibold text-white hover:bg-navy/90">
            Reload the page
          </button>
          <p className="mt-4 break-words font-mono text-xs text-ink-2">{String(error?.message ?? error)}</p>
        </div>
      </div>
    );
  }
}
