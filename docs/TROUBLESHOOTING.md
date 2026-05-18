# Troubleshooting

## The App Opens, But Shortening Fails

Check:

- `.env` contains a valid `VITE_SCRIPT_URL`.
- Apps Script is deployed from `google/combined.gs`.
- Web app access is set to `Anyone`.
- The Google Sheet has a `database` tab.
- `SCRIPT_URL` in `public/404.html` and `API_URL` in `public/report.html` match the deployed Apps Script URL.

## GitHub Action Fails at `npm ci`

`npm ci` requires `package.json` and `package-lock.json` to match.

Run locally:

```bash
npm install
npm ci --dry-run
```

Commit the updated `package-lock.json` when dependency metadata changes.

## Browser Shows CORS Errors for Apps Script

Confirm the deployed URL points to the Apps Script web app generated from `google/combined.gs`. The frontend uses GET requests because that path is CORS-compatible for this Apps Script setup.

After editing Apps Script, deploy a new Apps Script version. Saving the script alone is not enough for the public web app URL.

## GitHub Pages Is Blank and Requests `/src/main.tsx`

GitHub Pages is serving raw repository files instead of the Vite build artifact.

Check repository Pages settings and use GitHub Actions as the Pages source. Then rerun:

```bash
npm run build
npm run validate:deploy
```

## Local Short Links Return the Vite App Instead of the Preview Page

Local short-link fallback is implemented in `vite.config.ts`. Use the configured dev URL:

```text
http://127.0.0.1:5174/surl/<alias>
```

Avoid `/src/`, `/assets/`, `/node_modules/`, and static file paths when testing alias routes.

## Destination Preview Is Blank

Many sites block embedding with `X-Frame-Options` or CSP. The preview page still keeps the original destination in the open button. This is expected for providers that do not allow iframe previews.

## IP or Region Metadata Is Missing

The browser-side network lookup can fail because of network errors, privacy tools, third-party blocking, or lookup service outages. Link creation and reporting should still work without this metadata.

The stored IP/region fields are not authoritative because they come from client-side context. Use a trusted backend or proxy log if strict ban enforcement is required.

## Route or Base Path Changed

The project is currently deployed under `/surl/`. If that path changes, update route-sensitive files together:

- `vite.config.ts`
- `index.html`
- `public/404.html`
- `public/report.html`
- `public/manifest.json`
- `public/sw.js`
- `public/robots.txt`
- `public/sitemap.xml`
- `google/combined.gs`

Then run:

```bash
npm test -- routing.test.ts
npm run build
```
