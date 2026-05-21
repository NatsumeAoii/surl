# Changelog

All notable changes to SURL / S.url are documented here.

## [1.0.3]

### Added

- Added `public/static-config.js` as the shared browser runtime config for the React app, GitHub Pages redirect fallback, and report page.
- Added browser-side network lookup configuration for creator and reporter IP/region metadata, including timeout controls and missing-config fallbacks.
- Added dedicated project structure for `src/app`, `src/components`, `src/lib`, `src/styles`, `apps-script`, and categorized tests under `tests/backend`, `tests/config`, `tests/support`, and `tests/ui`.
- Added modular API, URL, fingerprint, QR code, request-progress, and app-helper internals with focused tests around each concern.
- Added deploy artifact validation for `static-config.js` and stricter deployed Pages smoke checks that verify the built Vite module instead of unrelated script tags.
- Added `.nojekyll` to the Pages artifact so GitHub Pages serves the uploaded static files without Jekyll processing.
- Expanded `.gitattributes` with deterministic LF-normalized text files and binary asset handling across Windows and CI.
- Added a Markdown `LICENSE.md` copy of the existing MIT license text.

### Changed

- Reorganized the React entry point so `src/main.tsx` imports the app from `src/app/App.tsx` and global CSS from `src/styles/index.css`.
- Split the former single-file helpers into smaller modules for API transport/retry/errors, URL validation/alias/date helpers, fingerprint consent/device/network helpers, and QR encoding/rendering.
- Moved Google Apps Script source from `google/` to `apps-script/` and kept legacy split scripts as explicit notices to deploy `apps-script/combined.gs` instead.
- Moved root-level tests into domain-specific `tests/` folders and updated documentation references to the new paths.
- Reworked `public/404.html` redirect states, destination preview, loading screen, owned errors, and report navigation to match the main S.url theme.
- Reworked `public/report.html` as a separate themed report page with structured reason, description, destination, reporter metadata, previous-page navigation, and homepage navigation.
- Changed destination opening from the redirect preview to use a new browser tab while preserving the resolved original URL.
- Changed service-worker behavior so `public/static-config.js` is handled with network-first caching instead of being locked behind stale cache-first behavior.
- Updated README, quick start, architecture, troubleshooting, contributing, security, and changelog docs to match the current folder structure and runtime config model.
- Expanded formatting scripts from `src` only to the whole repository with Prettier `--ignore-unknown`.
- Expanded `.gitignore` coverage for package-manager caches, package tarballs, temporary files, and local-only config files.

### Fixed

- Fixed the GitHub Actions `npm ci` failure by adding missing lockfile package records for `@emnapi/core@1.10.0` and `@emnapi/runtime@1.10.0`.
- Fixed blank GitHub Pages deployments caused by raw Vite source HTML by validating the built `dist` artifact and smoke-checking deployed module assets.
- Fixed local short-link dev testing so `/surl/<alias>` routes can load the static redirect fallback before production deployment.
- Fixed stale and duplicate loading behavior by adding synchronous submit guards, request-progress states, and timer cleanup for app interactions.
- Fixed static redirect/report API calls to fail safely when runtime config is missing instead of starting timers or controllers with empty service URLs.
- Fixed static report description truncation to use a named maximum length instead of an unrelated hardcoded slice value.
- Fixed old documentation references to `google/*`, `src/url.ts`, root-level tests, and the removed `routing.test.ts` path.

### Security

- Added Apps Script sheet schema support for access counts, last accessed timestamps, creator network metadata, and structured report metadata columns.
- Preserved server-side URL validation, spreadsheet formula neutralization, payload caps, prototype-pollution guards, and rate limits while moving Apps Script into `apps-script/`.
- Kept static destination previews sandboxed and documented that iframe preview failures caused by destination CSP or `X-Frame-Options` are expected.

### Performance

- Reduced repeated Apps Script duplicate-check work by keeping reusable URL lookup behavior covered by backend regression tests.
- Kept request progress responsive for long Apps Script calls without shortening the underlying request timeout.

### Documentation

- Documented the shared `public/static-config.js` workflow, including when `.env` `VITE_SCRIPT_URL` is only a React-local override.
- Documented the current project structure, quality gates, GitHub Pages source requirement, local short-link testing path, and known setup pitfalls.
- Documented that `SECURITY.md` and `CODE_OF_CONDUCT.md` still require a verified private maintainer contact before public community use.

## [1.0.2-b] - 2026-05-18

### Added

- Added package metadata for description, homepage, repository, issues, license, and supported Node runtime.
- Added deploy artifact validation and post-deploy GitHub Pages smoke checks to catch raw source deployments that request `/src/main.tsx`.
- Added contributor-focused README sections for quick start, configuration, architecture, troubleshooting, and Q&A.
- Added `SECURITY.md` with supported-version guidance, disclosure expectations, and deployer security notes.
- Added `LICENSE.md` as a Markdown copy of the existing MIT license text.
- Added Apps Script regression tests for URL validation, spreadsheet formula neutralization, global rate limiting, payload caps, and reusable URL lookup behavior.
- Added standalone developer quick start, architecture, and troubleshooting documents under `docs/`.

### Changed

- Restored GitHub Pages routing to `/surl/`.
- Added local dev fallback handling for `/surl/<alias>` short-link routes.
- Added an owned redirect error fallback for unexpected static redirect-page failures.
- Added a sandboxed destination iframe preview for unprotected, unexpired short links.
- Reworked the redirect loading, destination preview, and dedicated report pages to match the main S.url app theme.
- Updated the redirect preview summary to show the full original destination URL instead of only the destination domain.
- Changed redirect preview opening so confirmed destinations open in a new tab instead of replacing the preview page.
- Removed the second full-page loading cycle when opening an already-previewed destination.
- Added separate report-page navigation for returning to the previous preview or going back to the homepage.
- Added a redirect preview compatibility lookup for older Apps Script deployments that do not return `previewUrl`.
- Clarified code of conduct reporting expectations and the need for a verified private maintainer contact.
- Aligned contributing quality-gate commands with the deploy workflow.
- Marked unresolved private security and conduct contacts as requiring maintainer completion.
- Replaced committed legacy split-script spreadsheet IDs with explicit maintainer-completion placeholders.
- Improved Apps Script bulk duplicate checks by using a requested-URL lookup map instead of repeated full-sheet scans.
- Clarified README onboarding links, CI-like install guidance, and security-policy completeness.

### Fixed

- Switched browser-to-Apps-Script calls to the CORS-compatible GET transport used by Apps Script web apps.
- Aligned frontend password length with the backend password limit.
- Tightened Apps Script URL authority and port validation.

### Security

- Neutralized spreadsheet formula-leading characters in untrusted report and analytics fields before writing to Google Sheets.
- Added backend payload size checks and a global per-action rate limit to reduce abuse from oversized requests and spoofed client identities.
- Added password-attempt throttling for protected short-link reads.
- Blocked prototype-polluting request parameter names during Apps Script request normalization.
- Removed `Math.random()` from Apps Script alias generation.
- Switched password hash checks to constant-time string comparison.
- Documented that browser-collected IP and region metadata is not authoritative for ban enforcement.

## [1.0.1] - 2026-05-12

### Changed

- Updated GitHub Pages routing from `/natsume-url/` to `/surl/`.
- Updated canonical, Open Graph, Twitter, sitemap, robots, PWA manifest, service worker, and Apps Script base URLs.
- Renamed private package metadata from `natsume-url` to `surl`.
- Expanded `.gitignore` for generated output, tool caches, local worktrees, test artifacts, logs, and local env files.
- Refreshed README, LICENSE, contribution, and code of conduct documentation.

### Added

- Added routing regression tests for the Vite base path, static fallback, PWA files, SEO metadata, and Apps Script short-link base URLs.

## [1.0.0] - 2026-02-16

### Added

- QR code generation for every shortened URL using pure canvas.
- Optional link expiry.
- Password-protected links with salted SHA-256 hashes.
- Redirect preview page before visiting a destination.
- Bulk shortening for up to 10 URLs in a single request.
- Social sharing to X/Twitter, WhatsApp, and Telegram.
- Math CAPTCHA and honeypot checks for bot friction.
- Cookie consent banner.
- Anonymous analytics for device, browser, OS, language, referrer hostname, and screen size.
- Link abuse reporting with a `reports` sheet.
- PWA manifest, service worker cache with TTL, sitemap, robots.txt, social metadata, and favicon.
- CSP metadata for static pages.
- ESLint, Prettier, and `.env.example` configuration.
- GitHub issue templates.

### Changed

- Config reads from Vite environment variables with fallback values.
- Google Apps Script combined endpoint handles read, write, bulk, preview, history, and report actions.
- GitHub Pages 404 fallback handles preview, password prompt, expiry handling, and abuse reports.
- React app added lazy-loaded cookie consent, paste detection, character counters, QR/share controls, and UI state handling.

### Security

- Added Content Security Policy metadata.
- Added preconnects to Google Apps Script domains.
- Set consent cookie with `Secure` on HTTPS and `SameSite=Strict`.
- Added server-side field sanitization with caps and control character stripping.
- Avoided raw User-Agent transmission.
- Added server-side salted SHA-256 password hashing.

## [0.0.1] - 2026-02-16

### Added

- Initial Vite, React 19, and TypeScript build.
- S.url branding with dark-first UI.
- Initial Google Apps Script read/write implementation.
- GitHub Actions deployment to GitHub Pages.
- Rate limiting and URL validation in Apps Script.
