import { Suspense } from "react";
import { NavLink, Outlet } from "react-router";
import { Loading } from "../../components/States";

const tabs = [
  { to: "/admin/tables", label: "Tables" },
  { to: "/admin/warnings", label: "Warnings" },
  { to: "/admin/ingestion", label: "Ingestion" },
];

export default function AdminLayout() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-2">
          Manage the tables, warnings and data loads. Every change shows the SQL that ran; if the database
          refuses a change, you'll see which constraint said no.
        </p>
      </header>
      <nav aria-label="Admin" className="flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to}
                   className={({ isActive }) =>
                     `-mb-px border-b-2 px-4 py-2 text-sm font-medium ${isActive ? "border-navy text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Suspense fallback={<Loading label="Loading…" />}>
        <Outlet />
      </Suspense>
    </div>
  );
}
