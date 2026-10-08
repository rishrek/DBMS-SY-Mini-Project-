// The calm frame around the login and register pages: the logo (back to the
// landing page), the form in the middle, and a one-line footer.
import { Suspense } from "react";
import { Link, Outlet } from "react-router";
import { Loading } from "./States";

export default function AuthShell() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-page">
      <header className="mx-auto flex w-full max-w-6xl items-center px-4 py-4 sm:px-6">
        <Link to="/" className="flex items-center gap-3 rounded-lg">
          <img src="/favicon.svg" alt="" className="size-9" />
          <span className="font-semibold text-ink">Climate Intelligence System</span>
        </Link>
      </header>
      <main className="flex flex-1 justify-center px-4 pb-16 pt-6 sm:pt-12">
        <div className="w-full max-w-md">
          <Suspense fallback={<Loading label="Loading…" />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
      <footer className="px-4 pb-6 text-center text-xs text-ink-2">
        Weather data from Open-Meteo.com (CC BY 4.0). Our warnings are not official IMD warnings.
      </footer>
    </div>
  );
}
