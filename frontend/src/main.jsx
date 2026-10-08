// Entry point: mounts the React app into <div id="root"> in index.html.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "@fontsource-variable/plus-jakarta-sans";   // the website's font, served from our own files
import "leaflet/dist/leaflet.css";
import "./index.css";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {/* a crash anywhere shows a message with a Reload button, never a blank page */}
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
