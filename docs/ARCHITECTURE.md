# Architecture

S.url is a static React/Vite frontend backed by a Google Apps Script web app and Google Sheets.

## Components

| Component            | Location                                                       | Responsibility                                                                                           |
| -------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| React app            | `src/app/`                                                     | Main URL shortening UI, QR/share/history flows, client validation, request progress states.              |
| UI components        | `src/app/components/`, `src/components/`                       | App-specific panels plus shared icons and reusable browser components.                                   |
| App hooks/helpers    | `src/app/hooks/`, `src/app/helpers.ts`                         | Theme, request progress, alias generation, clipboard fallback, and app-only helper logic.                |
| API client           | `src/lib/api.ts`                                               | CORS-compatible Apps Script calls, timeouts, retries, and user-safe errors.                              |
| API internals        | `src/lib/api/`                                                 | Request URL serialization, transport, retry timing, and stable error types.                              |
| Config               | `src/lib/config.ts`, `public/static-config.js`, `.env.example` | Shared client service URLs plus optional Vite build overrides.                                           |
| Browser metadata     | `src/lib/fingerprint/`                                         | Consent storage, device detection, and browser-side network metadata collection.                         |
| QR helpers           | `src/lib/qrcode/`                                              | QR matrix encoding and canvas rendering behind the public `src/lib/qrcode.ts` facade.                    |
| URL helpers          | `src/lib/url/`                                                 | URL validation, alias sanitation, short-link normalization, and expiry date formatting.                  |
| Static redirect page | `public/404.html`                                              | GitHub Pages short-link fallback, destination preview, password prompt, owned errors, report navigation. |
| Static report page   | `public/report.html`                                           | Link abuse report form.                                                                                  |
| Static page config   | `public/static-config.js`                                      | Shared runtime constants for static redirect/report pages outside the Vite bundle.                       |
| Service worker       | `public/sw.js`                                                 | Static asset caching with TTL and network-first API handling.                                            |
| Apps Script API      | `apps-script/combined.gs`                                      | Read/write/bulk/preview/history/report actions, server-side validation, rate limits, sheet writes.       |
| Google Sheet         | external                                                       | Link, analytics, access-count, and report storage.                                                       |

## Request Flow

1. A user creates a short link in the React app.
2. `src/lib/api.ts` sends a GET request to Apps Script because the current GitHub Pages and Apps Script deployment path relies on that CORS-compatible response mode.
3. `apps-script/combined.gs` validates the URL, alias, expiry, password length, request size, and rate limits.
4. Apps Script writes the row to the `database` sheet and returns a short URL.
5. GitHub Pages serves `/surl/<alias>` through `public/404.html`.
6. The redirect page calls Apps Script `preview` and `read` actions, shows an interstitial preview, then opens the resolved destination in a new tab.

## Trust Boundaries

- Browser input is untrusted.
- `public/404.html` and `public/report.html` are separate static entry points and must validate independently.
- Apps Script is the backend trust boundary before writing to Google Sheets.
- Google Sheets stores untrusted text, so Apps Script neutralizes spreadsheet formula-leading characters in fields that can be written by users.
- IP and region metadata are collected in the browser through `ipapi.co`; treat them as useful operational context, not authoritative identity.
- Apps Script row access goes through named `DB_COL` schema indexes so column meaning stays tied to `DATABASE_HEADERS`.

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

The Apps Script deployment is manual from `apps-script/combined.gs`; it is not deployed by the GitHub Actions workflow.

## Known Architectural Constraints

- Google Sheets lookup cost grows with sheet size.
- React and static fallback pages share default service URL configuration through `public/static-config.js`; `.env` can override the React app only.
- State-changing Apps Script browser calls currently use GET for CORS compatibility.
- Password hashes use the current Apps Script SHA-256 implementation; migrate to a standard slow KDF before storing high-value secrets.
