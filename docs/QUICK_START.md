# Quick Start

Fastest path from a clean checkout to a local S.url development server.

## Prerequisites

- Node.js 20 or newer.
- npm.
- A Google Sheet and deployed `apps-script/combined.gs` web app for real shortening.

## Run Locally

```bash
npm install
cp .env.example .env
npm run dev
```

On Windows PowerShell, use:

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

Open:

```text
http://127.0.0.1:5174/surl/
```

The local dev server uses `strictPort: true`, so port `5174` must be free.

## Configure API Calls

Set `scriptUrl` in `public/static-config.js` to the deployed Apps Script URL for `apps-script/combined.gs`.

Static GitHub Pages fallback pages do not read `.env`. The React app loads the same `public/static-config.js` default at runtime. If you need a local React-only override, set `VITE_SCRIPT_URL` in `.env`.

If the Apps Script URL changes, update `public/static-config.js` first.

## Verify Before Hand-Off

```bash
npm test
npm run lint
npm run format:check
npm audit --audit-level=moderate
npm run build
npm run validate:deploy
```

## Apps Script Setup

1. Create a Google Sheet.
2. Add a tab named `database`.
3. Open `Extensions > Apps Script`.
4. Paste `apps-script/combined.gs`.
5. If the script is not bound to the sheet, set `SPREADSHEET_ID` in `apps-script/combined.gs`.
6. Confirm `BASE_URL` points to `https://natsumeaoii.github.io/surl/`.
7. Deploy as a web app with `Execute as: Me` and `Who has access: Anyone`.
8. Copy the deployment URL into `public/static-config.js` as `scriptUrl`.

## Local Short-Link Testing

The Vite dev server has a fallback for short-link routes. Open a route like:

```text
http://127.0.0.1:5174/surl/example-alias
```

That route loads `public/404.html` so the preview, password prompt, owned errors, and report flow can be tested before deploying to GitHub Pages.
