# Glance

[![Test](https://github.com/modem-dev/glance/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/modem-dev/glance/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Supported Agents](https://img.shields.io/badge/agents-pi%20%7C%20OpenCode%20%7C%20Claude%20Code%20%7C%20Codex-blue)](#agent-plugins)

Glance is temporary image sharing for coding agents and terminal workflows.
Paste a screenshot in your browser, get a short-lived URL, and hand it to an
agent that cannot receive images directly.

The hosted service runs at [glance.sh](https://glance.sh). This repository
contains both the web app and agent integrations.

## Repository layout

```text
apps/web/   Next.js app behind glance.sh
claude/     Claude Code plugin
codex/      Codex MCP integration
opencode/   OpenCode plugin
pi/         pi coding-agent extension
```

The plugin directories intentionally stay at the repository root for now so
existing install flows keep working. They may move under `plugins/` in a future
major cleanup.

## Web app

```bash
cd apps/web
npm ci
cp .env.example .env.local
npm run dev
```

Required services for a production-like deployment:

- Vercel Blob private store (`BLOB_READ_WRITE_TOKEN`)
- Upstash Redis (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`)
- Google Generative AI API key for OCR (`GOOGLE_GENERATIVE_AI_API_KEY`)
- `CRON_SECRET` for cleanup cron authentication

Optional app settings use the `GLANCE_*` prefix. Legacy `AGENTPASTE_*` names are
accepted for compatibility.

Telemetry is opt-in for self-hosters. Leave `NEXT_PUBLIC_SENTRY_DSN`,
`SENTRY_DSN`, and `NEXT_PUBLIC_VERCEL_ANALYTICS_ENABLED` unset/disabled to run
without Sentry or Vercel Analytics.

## Agent plugins

| Agent | Directory | npm package | Install |
|---|---|---|---|
| [pi](https://github.com/mariozechner/pi) | [`pi/`](pi/) | `@modemdev/glance-pi` | `pi install npm:@modemdev/glance-pi` |
| [OpenCode](https://github.com/anomalyco/opencode) | [`opencode/`](opencode/) | `@modemdev/glance-opencode` | Add `"@modemdev/glance-opencode"` to `opencode.json` `plugin` list |
| [Claude Code](https://github.com/anthropics/claude-code) | [`claude/`](claude/) | `@modemdev/glance-claude` | `/plugin marketplace add modem-dev/glance` then `/plugin install glance-claude@glance` |
| [Codex](https://developers.openai.com/codex) | [`codex/`](codex/) | `@modemdev/glance-codex` | `codex mcp add glance -- npx -y @modemdev/glance-codex` |

Each plugin creates a live session on glance.sh, gives you a URL to open, and
waits for you to paste an image. The image URL is returned to the agent over
SSE — no manual copy-paste needed.

```text
agent ──POST /api/session──▶ { id, url }
agent ──GET  /api/session/<id>/events──▶ SSE (waiting…)
user  ──opens /s/<id>, pastes image──▶ agent receives URL
```

## Development

Root plugin checks:

```bash
npm ci
npm test
npm run typecheck
```

Web checks:

```bash
npm --prefix apps/web ci
npm run test:web
npm run build:web
npm run typecheck:web
```

## Deployment safety

The public repository is not connected to the production Vercel project. The
hosted `glance.sh` service deploys from a separate private deployment repository
that only receives reviewed public commits. Public pull requests should never
run with production secrets.

## License

MIT. See [LICENSE](LICENSE).

The MIT license covers the code. The `glance.sh` domain, hosted service, and
associated branding remain operated by Modem Labs.
