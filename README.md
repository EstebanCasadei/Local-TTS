# Local-TTS

Generador de voz para contenido en español que corre completamente en local.
React + TypeScript + Vite, with Piper TTS in the browser.

Without Firebase env vars the app runs 100% local and makes no network calls.
Configure Firebase (optional) to enable auth and cross-device sync.

## Prerequisites

- Node `v24.11.1` (see `.nvmrc`) — use [nvm](https://github.com/nvm-sh/nvm): `nvm use`
- pnpm `11.21.0` (pinned via `packageManager` in `package.json`)

## Quick start

```bash
nvm use
pnpm install
cp .env.example .env      # optional — only needed for Firebase auth/sync
pnpm dev
```

The dev server starts without a `.env`; Firebase features simply stay disabled.

## Scripts

| Script                 | Description                                                    |
| ---------------------- | -------------------------------------------------------------- |
| `pnpm dev`             | Start the Vite dev server                                      |
| `pnpm build`           | Type-check (`tsc -b`) and build for production                 |
| `pnpm test`            | Run the vitest suite (offline, no Firebase calls)              |
| `pnpm test:watch`      | Watch mode                                                     |
| `pnpm verify:firebase` | Run the Firebase smoke test against your real project (opt-in) |
| `pnpm lint`            | Lint with Oxlint                                               |
| `pnpm preview`         | Preview the production build locally                           |

## Firebase setup (optional)

Firebase enables auth (#17) and Firestore sync (#18). Skip this if you only want
local-only usage.

1. **Create a project** at the [Firebase Console](https://console.firebase.google.com).
2. **Enable Firestore** — Build → Firestore Database → Create database
   (production mode is fine; `firestore.rules` locks it down to per-user paths).
3. **Enable Auth** — Build → Authentication → Sign-in method → enable
   **Google** and **Anonymous**.
4. **Register a web app** — Project Settings → General → Your apps → `</>`.
   Copy `apiKey`, `authDomain`, `projectId`, and `appId` into `.env`:

   ```
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_APP_ID=...
   ```

5. **Deploy the rules** (requires the Firebase CLI: `npm i -g firebase-tools`):

   ```bash
   nvm use
   firebase login
   firebase use --add <YOUR_PROJECT_ID>   # creates .firebaserc, alias "default"
   firebase deploy --only firestore:rules
   ```

`firestore.rules` isolates every user to their own subtree — a user can only
read and write `users/{uid}/{resto=**}`, and nothing outside `users/` is
accessible at all.

### Verifying the connection

Once `.env` is filled and the rules are deployed, run the smoke test:

```bash
pnpm verify:firebase
```

It signs in anonymously and round-trips a doc under `users/{uid}/_smoke/`,
which validates the config, the Anonymous auth provider, and the per-user
firestore rules. The test is opt-in (gated behind `FIREBASE_SMOKE_TEST=1`, set
automatically by the script) so `pnpm test` stays offline.

## Deployment (Firebase Hosting)

The app is a static SPA hosted on Firebase Hosting (same project as Auth +
Firestore). The `hosting` block in `firebase.json` points at `dist/` and adds a
catch-all rewrite to `index.html` — static assets (`/assets/*`, `/favicon.svg`)
are served first, then unmatched paths fall back to the SPA.

### One-time CI setup (HITL)

The deploy workflows reference a service-account secret. Run this once to
create it:

```bash
nvm use
firebase init hosting:github
```

The CLI walks you through selecting your Firebase project and the GitHub repo,
creates a service account with Hosting deploy permissions, and writes the
encrypted key to a repo secret named
`FIREBASE_SERVICE_ACCOUNT_<PROJECT_ID>` (e.g. `FIREBASE_SERVICE_ACCOUNT_LOCAL_TTS_AD27A`
for project `local-tts-ad27a`). The project ID is embedded as a literal in the
workflow YAML (it's a public identifier, not a secret). If you'd rather do it
manually: Firebase Console → Project Settings → Service Accounts → generate a
JSON key, then add it under that secret name in GitHub repo Settings → Secrets.

### Auto-deploys

Two GitHub Actions (using `FirebaseExtended/action-hosting-deploy`):

- **Preview on PR** (`.github/workflows/deploy-preview.yml`) — every PR gets a
  preview channel at a `*.web.app` URL, posted as a comment on the PR. The URL
  is stable per PR and updates on each push. Preview channels live under your
  project's own domain, which is already authorized for Firebase Auth — so
  previews can exercise real auth/sync flows (unlike Vercel's dynamic preview
  subdomains, which Firebase Auth can't allow-list). Channels expire after 30d.
- **Live on merge** (`.github/workflows/deploy-prod.yml`) — every push to
  `main` builds and deploys to the live channel.

### Manual deploy (optional)

```bash
nvm use
pnpm build
firebase deploy --only hosting
```

`firebase deploy` (no `--only`) deploys Firestore rules + indexes + hosting in
one shot.

## Tech notes

- **React Compiler** is enabled (via `babel-plugin-react-compiler`). See
  [the React docs](https://react.dev/learn/react-compiler). This affects dev
  and build performance.
- **Oxlint** is the linter. To enable type-aware lint rules, install
  `oxlint-tsgolint` and set `"options": { "typeAware": true }` in
  `.oxlintrc.json`. See the [Oxlint rules docs](https://oxc.rs/docs/usage/linter/rules).

## Chrome extension

Build the selection reader with `pnpm build:extension` and load `dist-extension` in Chrome Developer mode. Selected texts append to a queue and are highlighted directly on their source pages. See [installation, behavior and limits](docs/CHROME_EXTENSION.md).
