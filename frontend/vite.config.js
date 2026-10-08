// Vite: the development server and build tool for the React website.
//   npm run dev   -> http://localhost:5173
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Pack every library when the server starts, including the ones only lazily
  // loaded pages use (the map, the charts). Otherwise Vite finds them while a page
  // is open, re-packs, and that open tab can go blank ("504 Outdated Optimize Dep").
  optimizeDeps: {
    include: ["react", "react-dom/client", "react/jsx-dev-runtime", "react-router", "react-leaflet", "leaflet",
              "recharts", "@phosphor-icons/react"],
  },
  server: {
    port: 5173,        // the backend's CORS setting allows exactly this port
    strictPort: true,  // fail loudly instead of silently moving to another port
  },
});
