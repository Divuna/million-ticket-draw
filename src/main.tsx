import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initB2BAnalytics } from "./lib/b2bAnalytics";

// Global safety net for unhandled promise rejections (prevents blank screens)
window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
  event.preventDefault();
});

// Global safety net for uncaught errors
window.addEventListener("error", (event) => {
  console.error("Uncaught error:", event.error ?? event.message);
});

// GA4: measure clicks from /pro-eshopy to the existing partner registration.
initB2BAnalytics();

createRoot(document.getElementById("root")!).render(
  <>
    <App />
  </>
);
