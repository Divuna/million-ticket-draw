import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Global safety net for unhandled promise rejections (prevents blank screens)
window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
  event.preventDefault();
});

// Global safety net for uncaught errors
window.addEventListener("error", (event) => {
  console.error("Uncaught error:", event.error ?? event.message);
});

createRoot(document.getElementById("root")!).render(
  <>
    <App />
  </>
);
