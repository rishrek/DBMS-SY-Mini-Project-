// Which page shows for which address.
//   /                       the landing page (everyone)
//   /login, /register       the way in
//   /dashboard              warnings, map, forecast and charts (login needed)
//   /analytics, /integrity,
//   /admin/...              the team's pages (admin login; everyone else sees "page not found")
// The landing page and the login frame load at once; every other page is
// downloaded the first time it's opened (React.lazy), so the first visit is quick.
import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router";
import AuthShell from "./components/AuthShell";
import Layout, { RequireAdmin, RequireLogin } from "./components/Layout";
import LandingPage from "./pages/LandingPage";
import NotFoundPage from "./pages/NotFoundPage";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const HomePage = lazy(() => import("./pages/HomePage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const IntegrityPage = lazy(() => import("./pages/IntegrityPage"));
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminTablesPage = lazy(() => import("./pages/admin/AdminTablesPage"));
const AdminWarningsPage = lazy(() => import("./pages/admin/AdminWarningsPage"));
const AdminIngestionPage = lazy(() => import("./pages/admin/AdminIngestionPage"));

export default function App() {
  return (
    <Routes>
      <Route index element={<LandingPage />} />

      <Route element={<AuthShell />}>
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
      </Route>

      <Route element={<Layout />}>
        <Route path="dashboard" element={<RequireLogin><HomePage /></RequireLogin>} />
        <Route element={<RequireAdmin />}>
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="integrity" element={<IntegrityPage />} />
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="tables" replace />} />
            <Route path="tables" element={<AdminTablesPage />} />
            <Route path="warnings" element={<AdminWarningsPage />} />
            <Route path="ingestion" element={<AdminIngestionPage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
