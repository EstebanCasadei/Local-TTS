import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import * as Sentry from "@sentry/react";
import "./index.css";
import { router } from "./routes.tsx";

Sentry.init({
  dsn: "https://06d0b8b4e56544f98dd8dbb9bbac4aa4@app.glitchtip.com/27199",
  tracesSampleRate: 0.01, // 1% of transactions — adjust to your needs
  // Set by vite.config.ts to the current commit SHA when source-map upload is
  // enabled. GlitchTip matches minified stack frames to uploaded maps via this.
  release: import.meta.env.VITE_SENTRY_RELEASE,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
