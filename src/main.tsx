import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyBranding } from "@/lib/branding";

// Swap favicon / apple-touch-icon / PWA manifest to the uploaded company logo.
applyBranding();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
