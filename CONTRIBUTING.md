# Contributing

## Development Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env` and set `VITE_SCRIPT_URL`.
3. Start the dev server:

```bash
npm run dev
```

## Quality Gates

Run these before opening a pull request:

```bash
npm test
npm run lint
npm run format:check
npm run build
npm run validate:deploy
npm audit --audit-level=moderate
```

Use `npm run format` to apply Prettier formatting before rerunning the gate.

## Pull Requests

- Keep changes scoped to one behavior or documentation update.
- Add or update tests for behavior changes.
- Do not commit `dist/`, `node_modules/`, local `.env` files, caches, logs, or worktree folders.
- Keep user-facing errors stable and safe; diagnostics belong in server-side logs only.
- Use UTC for stored timestamps and convert at UI edges.
- Do not add runtime dependencies without explaining bundle-size and maintenance trade-offs.

## Routing Changes

This project is deployed under:

```text
https://natsumeaoii.github.io/surl/
```

If the repository path changes, update route-sensitive files together and run:

```bash
npm test -- routing.test.ts
npm run build
```

## Security

- Do not commit secrets, deployment URLs for private scripts, spreadsheet credentials, or personal data.
- Validate and sanitize data at API boundaries.
- Keep target URL validation aligned between `src/url.ts` and `google/combined.gs`.
- Preserve explicit request timeouts and bounded retries for external calls.
- Report suspected vulnerabilities privately to the maintainer instead of opening a public issue.
