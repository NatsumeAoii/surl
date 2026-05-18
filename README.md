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
http://127.0.0.1:5174/
```

The app can render without a custom `.env`, but real API calls depend on a valid Google Apps Script deployment URL.

## Configuration

Copy `.env.example` to `.env` and set values for local development.

<details>
<summary><strong>Environment variables</strong></summary>

| Variable            | Required               | Used by   | Purpose                                   |
| ------------------- | ---------------------- | --------- | ----------------------------------------- |
| `VITE_SCRIPT_URL`   | Yes for real API calls | React app | Google Apps Script web app URL.           |
| `VITE_APP_NAME`     | No                     | React app | Brand prefix shown before `.url`.         |
| `VITE_BASE_DISPLAY` | No                     | React app | Display-only short-link prefix in the UI. |
| `VITE_TAGLINE`      | No                     | React app | Brand subtitle in the header.             |

</details>

Important: `public/404.html` is served directly by GitHub Pages and does not read Vite environment variables. If the Apps Script deployment changes, update both:

- `VITE_SCRIPT_URL` in `.env`
- `SCRIPT_URL` inside `public/404.html`

## Google Apps Script Setup

1. Create a Google Sheet.
2. Add a tab named `database`.
3. Open `Extensions > Apps Script`.
4. Paste the full contents of `google/combined.gs`.
5. If the script is not bound to the sheet, set `SPREADSHEET_ID` in `google/combined.gs`.
6. Confirm `BASE_URL` in `google/combined.gs` points to `https://natsumeaoii.github.io/surl/`.
7. Deploy as a Web App:
    - Execute as: `Me`
    - Who has access: `Anyone`
8. Copy the deployment URL into `VITE_SCRIPT_URL`.

The combined script writes to this sheet shape:

<details>
<summary><strong>Database columns</strong></summary>

| Column        | Meaning                                    |
| ------------- | ------------------------------------------ |
| Timestamp     | ISO timestamp for creation.                |
| Alias         | Short-link alias.                          |
| URL           | Destination URL.                           |
| UID           | Anonymous user ID when consent is granted. |
| Device        | Coarse device category.                    |
| Browser       | Browser family/version label.              |
| OS            | Operating system label.                    |
| Language      | Browser language.                          |
| Referrer      | Referrer hostname when consent is granted. |
| Screen        | Screen dimensions.                         |
| Expiry        | Optional UTC expiry timestamp.             |
| Password Hash | Optional salted password hash.             |

</details>

## Commands

```bash
npm run dev
npm test
npm run lint
npm run format:check
npm run build
npm audit
```

The deploy workflow also runs `npm ci`, `npm audit --audit-level=moderate`, tests, lint, format check, and build before publishing to GitHub Pages.

## Project Structure

```text
src/
  App.tsx              React UI and workflow state
  api.ts               Apps Script HTTP client, timeouts, retries, safe errors
  config.ts            Vite-backed client config
  fingerprint.ts       Consent, UID cookie, coarse analytics helpers
  qrcode.ts            Dependency-free QR code renderer
  url.ts               URL, alias, password length, and date helpers
public/
  404.html             GitHub Pages short-link fallback and redirect preview
  sw.js                Service worker cache with TTL
  manifest.json        PWA manifest
google/
  combined.gs          Preferred Apps Script API
  get.gs, post.gs      Legacy split scripts kept for reference
.github/workflows/
  deploy.yml           GitHub Pages deployment workflow
```

## Architecture Overview

The React app validates user input, sends `text/plain` JSON requests to the Apps Script web app through `src/api.ts`, and displays single-link, bulk, QR, share, and history workflows. Apps Script validates the same trust boundary again, applies rate limits, writes to Google Sheets, and returns structured JSON responses.

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

Route-sensitive changes should also consider `routing.test.ts`, because this project is deployed under `/surl/`.

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

Check that `.env` contains a valid `VITE_SCRIPT_URL`, the Apps Script web app is deployed, and the deployment is accessible to `Anyone` as described above. Also update `SCRIPT_URL` in `public/404.html` for redirect fallback behavior.

</details>

<details>
<summary><strong>The browser reports a CORS error for the Apps Script URL.</strong></summary>

The frontend uses Apps Script's GET response path because it returns JSON with CORS headers on GitHub Pages. If CORS errors continue after redeploying the site, confirm the deployment URL points to `google/combined.gs`, deploy a new Apps Script version, and keep Web App access set to `Anyone`.

</details>

<details>
<summary><strong>Local dev server does not start on port 5174.</strong></summary>

`vite.config.ts` sets `strictPort: true`, so Vite will fail instead of choosing another port. Stop the process using port `5174`, or intentionally change the dev server config and update tests if that behavior is desired.

</details>

<details>
<summary><strong>Short links work in the app but not through GitHub Pages routes.</strong></summary>

The React app and `public/404.html` are separate entry points. Confirm the fallback file has the correct `BASE_PATH` and `SCRIPT_URL`, then run:

```bash
npm test -- routing.test.ts
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

Deploy `google/combined.gs`. The README and code comments describe it as the preferred API for read, write, bulk, preview, history, and report actions. `google/get.gs` and `google/post.gs` are legacy reference scripts.

</details>

<details>
<summary><strong>Why does `public/404.html` duplicate API configuration?</strong></summary>

GitHub Pages serves `404.html` directly for short-link routes. It runs outside the Vite bundle, so it cannot read `import.meta.env` or `.env` values. That is why `SCRIPT_URL` and `BASE_PATH` are hardcoded there.

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

`.env` files are ignored and `.env.example` contains only an example Apps Script URL. `public/404.html` and `src/config.ts` currently include a concrete Apps Script deployment URL as a public client endpoint, not a secret. Legacy reference scripts in `google/get.gs` and `google/post.gs` intentionally use `[FILL IN: Google Spreadsheet ID]` placeholders and should not be deployed without a real sheet ID.

</details>

<details>
<summary><strong>What should I test after changing URL validation?</strong></summary>

Run the full test suite. At minimum, run:

```bash
npm test -- src/url.test.ts google-script.test.ts
```

Keep client validation in `src/url.ts` and server validation in `google/combined.gs` aligned.

</details>

## Contributing

See `CONTRIBUTING.md`.

## Security

See `SECURITY.md`. This repository still needs `[FILL IN: verified private security contact]` before a public security policy is complete.

## Code of Conduct

See `CODE_OF_CONDUCT.md`.

## License

MIT. See `LICENSE` or `LICENSE.md`.
