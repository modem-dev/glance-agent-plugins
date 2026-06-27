# Testing

The web app uses Vitest for unit and route-contract tests.

## Commands

```bash
npm test            # run all tests once
npm run test:watch  # watch mode
npm run test:coverage
npm run typecheck
npm run build
npm run test:e2e:live
```

`test:e2e:live` is an env-gated live E2E suite that exercises security-critical
flows against a running app:

- upload-proof issuance/upload validation
- session SSE contract (`/api/session`, `/events`, `/push`)

Configuration:

- `RUN_LIVE_E2E=1` enables execution (otherwise the suite is skipped)
- `LIVE_E2E_BASE_URL` sets the target app URL (defaults to `http://127.0.0.1:3000`)

## Coverage policy

Minimum thresholds:

- lines >= 85%
- branches >= 80%
- functions >= 85%
- statements >= 85%

Security-critical app routes are explicitly included in coverage targeting,
including:

- `app/[token]/route.ts`
- `app/api/issue/route.ts`
- `app/api/upload/route.ts`
- `app/api/ocr/route.ts`
- `app/api/cron/*`
- `app/api/session/*`

The full agent plugin matrix is tested from the repository root.

## CI behavior

Public CI should run web tests/builds and plugin tests without production
secrets. Live E2E suites should remain opt-in and must not expose hosted-service
secrets to untrusted PRs.
