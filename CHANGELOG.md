# Changelog

All notable changes to SURL / S.url are documented here.

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
