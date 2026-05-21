# Security Policy

## Supported Versions

This repository currently shows one active development line:

| Version or branch        | Supported                                           |
| ------------------------ | --------------------------------------------------- |
| `main`                   | Yes                                                 |
| Older released snapshots | No, unless the maintainer explicitly says otherwise |

The package version in `package.json` is `1.0.2-b`. There are no visible long-term support branches in this repository.

## Reporting a Vulnerability

Private security contact: not published in this repository.

This repository does not currently expose a verified private security contact or repository-specific private vulnerability reporting URL in the checked-in files.

Before publishing this project for public use, the maintainer should add one of the following real private disclosure channels:

- GitHub private vulnerability reporting for this repository, if enabled.
- A monitored security email address controlled by the maintainer.
- Another private reporting channel documented by the maintainer.

Until that contact exists, do not include exploit details in a public issue. Use the public issue tracker only to ask for a private disclosure channel:

```text
https://github.com/natsumeaoii/surl/issues
```

## What to Include

When reporting privately, include:

- Affected file or deployed component.
- Vulnerability class and impact.
- Reproduction steps or proof of concept.
- Whether the issue affects the React app, `public/404.html`, Apps Script, Google Sheet data, or the GitHub Pages deployment.
- Any suggested fix, if known.

Do not include personal data, real user link data, credentials, or private spreadsheet contents.

## Expected Response

No response SLA is visible in the repository. Recommended maintainer policy:

- Acknowledge within 7 days.
- Triage severity and affected versions.
- Coordinate a fix before public disclosure when the issue is exploitable.
- Credit reporters when requested and appropriate.

## Known Security Considerations for Deployers

- `apps-script/combined.gs` is the preferred Apps Script API. Confirm legacy `apps-script/get.gs` and `apps-script/post.gs` are not deployed unless intentionally supported.
- Deploy Apps Script with the least access that still supports the app. The README setup uses `Execute as: Me` and `Who has access: Anyone`.
- Keep the Google Sheet private except for the Apps Script execution path.
- Replace public deployment URLs before publishing if they point to private or personal infrastructure.
- Keep frontend URL validation aligned with Apps Script validation. Client-side validation is not a security boundary.
- Password-protected links use server-side salted SHA-256 hashes in the current code. For stronger password storage, plan a migration to a password KDF before storing high-value secrets.
- Protected link password attempts are rate-limited in Apps Script, but this does not replace a stronger password hashing migration.
- Browser calls to Apps Script currently use GET query strings for CORS compatibility. Avoid sending secrets or private personal data through report descriptions, aliases, or URLs.
- The app stores an anonymous UID cookie only after consent. Avoid adding PII to analytics fields or logs.
