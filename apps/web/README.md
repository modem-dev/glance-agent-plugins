# glance.sh web app

Temporary image sharing for coding agents. Paste a screenshot, get a URL your agent can fetch.

**[glance.sh](https://glance.sh)** · [𝕏 @modemdev](https://x.com/modemdev)

## Why glance.sh

- Your agent cannot see your screen — give it a URL it can `curl`
- Paste, drag, or choose an image → get a link in seconds
- OCR built in — extract text from screenshots with one click
- Short-lived URLs — images auto-expire and are permanently deleted
- No accounts, no auth, no signup

## Live sessions

For agents that can open a browser tab, glance.sh supports live sessions: the
agent creates a session, gives you a URL, and waits. You paste an image and the
agent receives it instantly over SSE.

```text
agent ──POST /api/session──▶ { id, url }
agent ──GET  /api/session/<id>/events──▶ (SSE, waiting…)
user  ──opens /s/<id>, pastes image──▶ agent receives URL
```

Agent integrations live at the repository root (`claude/`, `codex/`,
`opencode/`, and `pi/`).

## Development

```bash
npm ci
cp .env.example .env.local
npm run dev
```

## Environment

Required for production-like use:

```text
NEXT_PUBLIC_BASE_URL=         # public app URL, e.g. https://glance.sh
BLOB_READ_WRITE_TOKEN=        # Vercel Blob private store
CRON_SECRET=                  # authenticates cleanup cron
GOOGLE_GENERATIVE_AI_API_KEY= # Gemini Flash for OCR
UPSTASH_REDIS_REST_URL=       # Upstash Redis sessions/rate limits
UPSTASH_REDIS_REST_TOKEN=     # Upstash Redis sessions/rate limits
```

Optional app settings:

```text
GLANCE_TTL_MINUTES=30
GLANCE_MAX_UPLOAD_MB=15
GLANCE_UPLOAD_TOKEN_TTL_SECONDS=300
GLANCE_UPLOAD_PROOF_SECRET=
GLANCE_CLEANUP_BATCH_SIZE=100
GLANCE_ALLOW_UNAUTHENTICATED_CRON=0
```

Legacy `AGENTPASTE_*` names are still accepted for compatibility.

Optional telemetry, disabled by default:

```text
NEXT_PUBLIC_VERCEL_ANALYTICS_ENABLED=0
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
```

## Testing

```bash
npm test
npm run test:coverage
npm run typecheck
npm run build
```

## Architecture

- Next.js App Router on Vercel
- Vercel Blob private storage for images
- Upstash Redis for live sessions and rate limits
- Gemini 2.5 Flash for OCR
- Token expiry is encoded in the URL and enforced on every request
- Cleanup cron deletes expired physical blobs; expiry does not depend on cleanup timing

## Deployment safety

The hosted `glance.sh` service deploys from a separate private deployment repo.
Do not connect the public OSS repository to a Vercel project with production
secrets, and do not run untrusted PR previews with production env vars.

## License

MIT. See the repository root [LICENSE](../../LICENSE).

For abuse reports or content removal on the hosted service:
[support@modem.dev](mailto:support@modem.dev)
