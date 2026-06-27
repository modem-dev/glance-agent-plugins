# AGENTS.md

Guidance for coding agents working in this repository.

## Purpose

This repo is the public Glance monorepo. It contains:

- `apps/web/` — the Next.js web app behind glance.sh.
- `claude/`, `codex/`, `opencode/`, `pi/` — agent integrations.

Glance provides temporary image sharing for coding agents and terminal workflows.

## Repository shape

- Keep the existing plugin directories at the repository root during the first
  monorepo migration to preserve install flows.
- The web app has its own package and lockfile under `apps/web/` so Vercel can
  deploy it with Root Directory = `apps/web`.
- Public CI must not require production secrets.
- The hosted service deploys from a separate private deployment repo, not from
  untrusted public PRs.

## Plugin expectations

- Keep plugins self-contained inside their own directory.
- Prefer platform-native APIs such as `fetch`, `AbortController`, and
  `ReadableStream` over adding new dependencies.
- Preserve the style already used in the plugin you are editing.
- Update the plugin `README.md` whenever install steps, behavior, supported
  commands/tools, or runtime requirements change.
- If a plugin has internal async/session logic that is hard to verify from the
  public API alone, expose a small `__testing` surface rather than making
  production code more coupled.

Every plugin should cover the same core lifecycle:

- create a glance session
- surface the session URL to the agent or user
- listen for image events over SSE
- handle reconnects, timeouts, expiry, and cancellation
- return or inject the received image URL in the host agent's expected format

If you fix a behavior bug in one plugin, check the other plugins for the same
pattern before stopping.

## Web app expectations

Read `apps/web/AGENTS.md` before changing the web app.

Important invariants:

- Blob storage is private.
- Shared links point to app routes such as `/<token>.<ext>`, never raw Blob URLs.
- Expiry is enforced by the app route on every request.
- Client components must not import server-only modules.
- The session API contract is consumed by the root plugins; coordinate changes.
- Sentry and analytics must remain opt-in for self-hosters.

## Validation

Plugin validation from the repository root:

```bash
npm ci
npm run test:plugins
npm run typecheck:plugins
```

Web validation:

```bash
npm --prefix apps/web ci
npm run test:web
npm run typecheck:web
npm run build:web
```

Full validation:

```bash
npm test
npm run typecheck
npm run build:web
```

If a command cannot be run, say so explicitly and explain why.

## PR checklist

- Plugin implementation, tests, and README are updated together when plugin behavior changes.
- Web app behavior changes include route/component tests where practical.
- Public CI does not depend on production secrets.
- No hard-coded deployment telemetry, org IDs, or private repo paths are added.
- User-visible behavior changes are called out in the PR description.
