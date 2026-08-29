import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyBranding } from "@/lib/branding";
import { registerPwa } from "@/pwa/registerSW";
import { applyTheme, getStoredTheme } from "@/hooks/useTheme";

// Apply the saved Light/Dark preference before first paint (localStorage only).
applyTheme(getStoredTheme());

// Swap favicon / apple-touch-icon / PWA manifest to the uploaded company logo.
applyBranding();

// Register the service worker (guarded — production only, never in preview/iframes).
registerPwa();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

