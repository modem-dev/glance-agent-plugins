# Contributing

Thanks for helping improve Glance.

## Development setup

```bash
git clone https://github.com/modem-dev/glance.git
cd glance
npm ci
npm --prefix apps/web ci
```

## Validate changes

Plugins:

```bash
npm run test:plugins
npm run typecheck:plugins
```

Web app:

```bash
npm run test:web
npm run typecheck:web
npm run build:web
```

Full local check:

```bash
npm test
npm run typecheck
npm run build:web
```

## Pull requests

- Keep changes focused.
- Update docs when install steps, env vars, routes, or user-visible behavior change.
- Add or update tests for behavior changes.
- Do not add production secrets, deployment-only state, `.env` files, or hard-coded telemetry DSNs.
- Public PRs should be safe to run without secrets.

## Deployment

The hosted `glance.sh` service deploys from a private deployment repository after
reviewed public commits are synced. Public PRs do not deploy to production and
must never require production env vars.
