import { execSync } from "node:child_process";
import { defineConfig, loadEnv } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import svgr from "vite-plugin-svgr";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// GlitchTip source-map upload is opt-in: only enabled when the build runs with
// SENTRY_AUTH_TOKEN (+ SENTRY_ORG / SENTRY_PROJECT) available. Without them, no
// source maps are generated and the plugin is skipped, so a plain `pnpm build`
// works with zero setup. GlitchTip is Sentry-API compatible but lacks the
// artifact-bundle / Debug-ID flow, so we use the legacy release-based upload
// (release.uploadLegacySourcemaps) and skip release finalization (GlitchTip
// returns 405 on `releases finalize`).

/** Current commit SHA, or undefined if git isn't available. */
function gitHead(): string | undefined {
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Empty prefix => load every var from .env(.local/.<mode>), not just VITE_*.
  const env = loadEnv(mode, process.cwd(), "");
  const SENTRY_AUTH_TOKEN = env.SENTRY_AUTH_TOKEN;
  const SENTRY_ORG = env.SENTRY_ORG;
  const SENTRY_PROJECT = env.SENTRY_PROJECT;
  const SENTRY_URL = env.SENTRY_URL ?? "https://app.glitchtip.com";
  const sentryEnabled = Boolean(SENTRY_AUTH_TOKEN && SENTRY_ORG && SENTRY_PROJECT);

  // Release = current commit SHA. The same value tags the uploaded source maps
  // (plugin) and the client's error events (Sentry.init via VITE_SENTRY_RELEASE)
  // so GlitchTip can match minified frames back to the original source.
  const release = sentryEnabled ? gitHead() : undefined;

  return {
    plugins: [
      react(),
      babel({ presets: [reactCompilerPreset()] }),
      tailwindcss(),
      svgr(),
      ...(sentryEnabled
        ? [
            sentryVitePlugin({
              url: SENTRY_URL,
              org: SENTRY_ORG,
              project: SENTRY_PROJECT,
              authToken: SENTRY_AUTH_TOKEN,
              release: {
                name: release,
                inject: false, // release is passed to Sentry.init via VITE_SENTRY_RELEASE
                finalize: false, // GlitchTip returns 405 on releases finalize
                setCommits: false, // GlitchTip commit-association API is unreliable
                deploy: false, // GlitchTip deploy API is unreliable
                uploadLegacySourcemaps: "./dist", // GlitchTip has no artifact-bundle endpoint
              },
              sourcemaps: {
                filesToDeleteAfterUpload: "**/*.map", // keep maps out of the deployed bundle
              },
              telemetry: false,
            }),
          ]
        : []),
    ],
    build: {
      // "hidden": generate source maps without a sourceMappingURL comment so
      // the browser never fetches them. The plugin uploads them to GlitchTip
      // then deletes them from dist; only minified code ships to Firebase Hosting.
      sourcemap: sentryEnabled ? "hidden" : false,
    },
    define: {
      // Expose the release to the client so Sentry.init can tag events. Only
      // defined when error tracking is enabled; otherwise it resolves to undefined.
      ...(release ? { "import.meta.env.VITE_SENTRY_RELEASE": JSON.stringify(release) } : {}),
    },
    worker: {
      format: "es",
    },
  };
});
