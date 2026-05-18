# Architecture

S.url is a static React/Vite frontend backed by a Google Apps Script web app and Google Sheets.

## Components

| Component | Location | Responsibility |
| --- | --- | --- |
| React app | `src/` | Main URL shortening UI, QR/share/history flows, client validation, request progress states. |
| API client | `src/api.ts` | CORS-compatible Apps Script calls, timeouts, retries, and user-safe errors. |
| Config | `src/config.ts`, `.env.example` | Vite-exposed app configuration and fallback Apps Script URL. |
| Static redirect page | `public/404.html` | GitHub Pages short-link fallback, destination preview, password prompt, owned errors, report navigation. |
| Static report page | `public/report.html` | Link abuse report form. |
| Service worker | `public/sw.js` | Static asset caching with TTL and network-first API handling. |
| Apps Script API | `google/combined.gs` | Read/write/bulk/preview/history/report actions, server-side validation, rate limits, sheet writes. |
| Google Sheet | external | Link, analytics, access-count, and report storage. |

## Request Flow

1. A user creates a short link in the React app.
2. `src/api.ts` sends a GET request to Apps Script because the current GitHub Pages and Apps Script deployment path relies on that CORS-compatible response mode.
3. `google/combined.gs` validates the URL, alias, expiry, password length, request size, and rate limits.
4. Apps Script writes the row to the `database` sheet and returns a short URL.
5. GitHub Pages serves `/surl/<alias>` through `public/404.html`.
6. The redirect page calls Apps Script `preview` and `read` actions, shows an interstitial preview, then opens the resolved destination in a new tab.

## Trust Boundaries

- Browser input is untrusted.
- `public/404.html` and `public/report.html` are separate static entry points and must validate independently.
- Apps Script is the backend trust boundary before writing to Google Sheets.
- Google Sheets stores untrusted text, so Apps Script neutralizes spreadsheet formula-leading characters in fields that can be written by users.
- IP and region metadata are collected in the browser through `ipapi.co`; treat them as useful operational context, not authoritative identity.

## Data Storage

The `database` sheet stores:

- alias and destination URL
- optional expiry
- optional password hash
- anonymous UID when cookie consent is granted
- coarse device metadata
- access count and last accessed timestamp
- browser-reported creator network metadata

The `reports` sheet stores:

- reported alias
- reason and optional description
- destination context
- browser-reported reporter network metadata

## Deployment

GitHub Actions builds the Vite app and deploys `dist` to GitHub Pages. The workflow is `.github/workflows/deploy.yml`.

The Apps Script deployment is manual from `google/combined.gs`; it is not deployed by the GitHub Actions workflow.

## Known Architectural Constraints

- Google Sheets lookup cost grows with sheet size.
- Static fallback pages duplicate API URL configuration because they run outside the Vite bundle.
- State-changing Apps Script browser calls currently use GET for CORS compatibility.
- Password hashes use the current Apps Script SHA-256 implementation; migrate to a standard slow KDF before storing high-value secrets.
