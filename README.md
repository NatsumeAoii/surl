# SURL

S.url is a serverless URL shortener built with React, TypeScript, Vite, Google Apps Script, and Google Sheets.

Production URL:

```text
https://natsumeaoii.github.io/surl/
```

## What It Does

- Shortens a single URL or a batch of up to 10 URLs.
- Supports custom aliases, random aliases, QR codes, expiry dates, and password-protected links.
- Uses a GitHub Pages `404.html` fallback to resolve short aliases.
- Stores link data in a Google Sheet through a Google Apps Script web app.
- Provides a redirect preview page and abuse report flow.
- Shows link history only after cookie consent.
- Tracks successful redirect access counts and coarse creator/report network metadata.

## Developer Docs

- [Quick start](docs/QUICK_START.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)

## Quick Start

Prerequisites visible from the repo:

- Node.js 20 is used by the GitHub Actions deploy workflow.
- npm is used for install, scripts, and CI.
- A Google Sheet and deployed Google Apps Script are required for real shortening.

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

The local Vite server is configured in `vite.config.ts`:

```text
http://127.0.0.1:5174/surl/
```

The app can render without a custom `.env`, but real API calls depend on a valid Google Apps Script deployment URL.

## Configuration

Copy `.env.example` to `.env` and set values for local development.

<details>
<summary><strong>Environment variables</strong></summary>

| Variable            | Required | Used by   | Purpose                                          |
| ------------------- | -------- | --------- | ------------------------------------------------ |
| `VITE_SCRIPT_URL`   | No       | React app | Optional local override for the Apps Script URL. |
| `VITE_APP_NAME`     | No       | React app | Brand prefix shown before `.url`.                |
| `VITE_BASE_DISPLAY` | No       | React app | Display-only short-link prefix in the UI.        |
| `VITE_TAGLINE`      | No       | React app | Brand subtitle in the header.                    |

</details>

Important: `public/404.html` and `public/report.html` are served directly by GitHub Pages and do not read Vite environment variables. The shared default client runtime config lives in `public/static-config.js`; `VITE_SCRIPT_URL` only overrides the React app during Vite builds.

If the Apps Script deployment changes, update:

- `scriptUrl` in `public/static-config.js`
- `networkLookupUrl` in `public/static-config.js`, only if changing the browser-side IP/region lookup service
- `VITE_SCRIPT_URL` in `.env`, only when you need a local React-only override

## Google Apps Script Setup

1. Create a Google Sheet.
2. Add a tab named `database`.
3. Open `Extensions > Apps Script`.
4. Paste the full contents of `apps-script/combined.gs`.
5. If the script is not bound to the sheet, set `SPREADSHEET_ID` in `apps-script/combined.gs`.
6. Confirm `BASE_URL` in `apps-script/combined.gs` points to `https://natsumeaoii.github.io/surl/`.
7. Deploy as a Web App:
    - Execute as: `Me`
    - Who has access: `Anyone`
8. Copy the deployment URL into `public/static-config.js` as `scriptUrl`. Use `.env` `VITE_SCRIPT_URL` only for local React-only overrides.

</details>

## Commands

```bash
npm run dev
npm test
npm run lint
npm run format:check
npm run build
npm run validate:deploy
npm audit --audit-level=moderate
```

The deploy workflow also runs `npm ci`, `npm audit --audit-level=moderate`, tests, lint, format check, build, deploy artifact validation, and a post-deploy GitHub Pages smoke check. Use `npm ci` when you want the same clean-install behavior as CI.

## Project Structure

```text
src/
  main.tsx             Vite/React browser entry point
  app/                 React UI and workflow state
    components/        App-specific panels and request progress UI
    hooks/             Theme and request-progress hooks
    helpers.ts         Alias, analytics, clipboard, and app-only helpers
  components/          Reusable UI components and icons
  lib/                 API, config, URL, QR, fingerprint, and progress helpers
    api/               Request URL building, transport, retries, and errors
    fingerprint/       Consent storage, device detection, and network metadata
    qrcode/            QR encoding and canvas rendering internals
    url/               URL validation, alias normalization, short links, dates
  styles/              Global application CSS
public/
  404.html             GitHub Pages short-link fallback and redirect preview
  static-config.js     Shared runtime config for static fallback/report pages
  report.html          Link abuse report page
  sw.js                Service worker cache with TTL
  manifest.json        PWA manifest
apps-script/
  combined.gs          Preferred Apps Script API
  get.gs, post.gs      Legacy split scripts kept for reference
scripts/
  validate-deploy-artifact.mjs
  verify-deployed-pages.mjs
tests/
  backend/             Apps Script behavior and sheet-shape tests
  config/              Routing, base-path, and deployment workflow tests
  support/             Shared test helpers for project-root file reads
  ui/                  Static UI, redirect, preview, and report page guards
  ui-ux/               Manual UX experiment notes and review checklists
.github/workflows/
  deploy.yml           GitHub Pages deployment workflow
```

## Architecture Overview

The React app validates user input, sends CORS-compatible GET requests to the Apps Script web app through `src/lib/api.ts`, and displays single-link, bulk, QR, share, and history workflows. Apps Script validates the same trust boundary again, applies rate limits, writes to Google Sheets, and returns structured JSON responses.

For short links, GitHub Pages serves `public/404.html`. That file extracts the alias from the path, calls Apps Script for preview/read/report actions, and redirects only after validating that the resolved URL is `http` or `https` and has no embedded credentials.

Google Sheets is the datastore. This keeps deployment simple, but means large data sets can make lookup-heavy operations slower. Current tests include route, URL validation, API transport, Apps Script helper, and static layout guards.

## Testing and Quality Gates

Run the full local gate before opening a pull request:

```bash
npm test
npm run lint
npm run format:check
npm run build
npm audit
```

Route-sensitive changes should also consider `tests/config/routing.test.ts`, because this project is deployed under `/surl/`.

For local short-link testing, run `npm run dev` and open a short-link route directly:

```text
http://127.0.0.1:5174/surl/example-alias
```

The dev server serves `public/404.html` for local `/surl/<alias>` routes so the redirect preview, owned error, password prompt, and report flow can be tested before GitHub Pages deployment.

## Deployment

Deployment is handled by `.github/workflows/deploy.yml`.

1. Push to `main`, or run `workflow_dispatch`.
2. The workflow installs with `npm ci`.
3. It audits, tests, lints, checks formatting, builds, and uploads `dist`.
4. GitHub Pages deploys the uploaded artifact.

GitHub Pages must be configured to use GitHub Actions as the source.

## Troubleshooting

<details>
<summary><strong>The app opens, but shortening fails.</strong></summary>

Check that `public/static-config.js` contains a valid `scriptUrl`, the Apps Script web app is deployed, and the deployment is accessible to `Anyone` as described above. If `.env` contains `VITE_SCRIPT_URL`, confirm it is not overriding the React app with an old deployment URL.

</details>

<details>
<summary><strong>The browser reports a CORS error for the Apps Script URL.</strong></summary>

The frontend uses Apps Script's GET response path because it returns JSON with CORS headers on GitHub Pages. If CORS errors continue after redeploying the site, confirm the deployment URL points to `apps-script/combined.gs`, deploy a new Apps Script version, and keep Web App access set to `Anyone`.

</details>

<details>
<summary><strong>Local dev server does not start on port 5174.</strong></summary>

`vite.config.ts` sets `strictPort: true`, so Vite will fail instead of choosing another port. Stop the process using port `5174`, or intentionally change the dev server config and update tests if that behavior is desired.

</details>

<details>
<summary><strong>Short links work in the app but not through GitHub Pages routes.</strong></summary>

The React app, `public/404.html`, and `public/report.html` are separate entry points. Confirm `BASE_PATH` in the fallback page and `scriptUrl` in `public/static-config.js`, then run:

```bash
npm test -- tests/config/routing.test.ts
npm run build
```

</details>

<details>
<summary><strong>GitHub Pages assets 404 after a path or repository rename.</strong></summary>

Update all route-sensitive files together: `vite.config.ts`, `public/404.html`, `public/manifest.json`, `public/sw.js`, `public/robots.txt`, `public/sitemap.xml`, `index.html`, and Apps Script `BASE_URL` values. The routing tests cover these paths.

</details>

<details>
<summary><strong>The deployed page is blank and the console requests `/src/main.tsx`.</strong></summary>

That means GitHub Pages is serving raw repository files instead of the Vite `dist` artifact. In the repository settings, configure Pages to use GitHub Actions as the source, then rerun `.github/workflows/deploy.yml`. The workflow now validates `dist` before upload and smoke-checks the deployed page after deployment.

</details>

## Q&A

<details>
<summary><strong>Which Apps Script file should I deploy?</strong></summary>

Deploy `apps-script/combined.gs`. The README and code comments describe it as the preferred API for read, write, bulk, preview, history, and report actions. `apps-script/get.gs` and `apps-script/post.gs` are legacy reference scripts.

</details>

<details>
<summary><strong>Why is there a `public/static-config.js` file?</strong></summary>

GitHub Pages serves `404.html` and `report.html` directly for short-link support pages. They run outside the Vite bundle, so they cannot read `import.meta.env` or `.env` values. Shared service URLs live in `public/static-config.js`; route base paths remain hardcoded in static pages and routing config because GitHub Pages serves this project under `/surl/`.

</details>

<details>
<summary><strong>Does the frontend validation replace backend validation?</strong></summary>

No. Frontend validation improves UX, but Apps Script still validates target URLs, aliases, payload sizes, rate limits, reports, and stored redirect URLs at the API boundary.

</details>

<details>
<summary><strong>Where is link history stored?</strong></summary>

History is derived from rows in the Google Sheet where the UID column matches the consenting user's `ntsm_uid` cookie. Without cookie consent, the app does not send the UID for history.

</details>

<details>
<summary><strong>Are secrets committed?</strong></summary>

`.env` files are ignored and `.env.example` contains only an example Apps Script URL. `src/lib/config.ts`, `public/404.html`, and `public/report.html` currently include a concrete Apps Script deployment URL as a public client endpoint, not a secret. `apps-script/get.gs` and `apps-script/post.gs` are inert legacy notices; deploy `apps-script/combined.gs`.

</details>

<details>
<summary><strong>What should I test after changing URL validation?</strong></summary>

Run the full test suite. At minimum, run:

```bash
npm test -- src/lib/url.test.ts tests/backend/google-script.test.ts
```

Keep client validation in `src/lib/url.ts` and server validation in `apps-script/combined.gs` aligned.

</details>

## Contributing

See `CONTRIBUTING.md`.

## Security

See `SECURITY.md`. This repository does not currently publish a verified private security contact, so the security policy is intentionally incomplete until the maintainer enables a private disclosure channel.

## Code of Conduct

See `CODE_OF_CONDUCT.md`.

## License

MIT. See `LICENSE` or `LICENSE.md`.
