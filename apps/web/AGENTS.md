# glance.sh web app agent guide

## Purpose

`glance.sh` is a small Next.js app for handing image uploads to terminal-only workflows.
The app accepts a pasted image or chosen file, uploads it to a private Vercel Blob store,
and returns a temporary app-served URL like `https://glance.sh/<token>.<ext>`.

The short app URL is the public interface. The blob itself stays private.

## Current UX

- `/` is the primary upload surface.
- successful uploads stay on `/` and append result cards below the paste box.
- users can paste multiple images in a row without navigating back.
- `/p/[token]` is a secondary result/share page, not the default success flow.

## Request flow

```text
paste image / choose file
        |
        v
   POST /api/issue
        |
        v
mint token + expiry + upload proof
        |
        v
browser upload() -> /api/upload -> private Vercel Blob
        |
        v
stay on /
        |
        v
append share card with /<token>.<ext>
        |
        v
client / agent fetches image through app route
```

## Live session flow

```text
agent calls POST /api/session
        |
        v
returns { id, url: "/s/<id>" }
        |
        v
agent shows url to user / opens browser
        |
        v
agent connects GET /api/session/<id>/events (SSE)
        |
        v
user opens /s/<id>, pastes image
        |
        v
browser uploads to Blob, then POST /api/session/<id>/push
        |
        v
SSE emits "image" event with { url, expiresAt }
        |
        v
agent receives image URL
```

Sessions are stored in Upstash Redis with a 10-minute TTL. They are lightweight
coordination channels; image bytes still live in Vercel Blob and are served
through the normal `/<token>` app route.

## Important routes

- `/` — single-page uploader and recent-results list.
- `/s/[id]` — session upload page.
- `/p/[token]` — secondary share page with preview/copy actions.
- `/[token]` — image streaming route; validates expiry and streams the private blob.
- `/api/session` — create a live session.
- `/api/session/[id]/push` — push an uploaded image URL into a session.
- `/api/session/[id]/events` — SSE stream for session events.
- `/api/issue` — mint token, expiry timestamp, and upload proof.
- `/api/upload` — Vercel Blob client-upload token exchange and validation.
- `/api/ocr` — OCR helper.
- `/api/cron/cleanup` — delete expired blobs from storage.

## Important files

- `app/page.tsx` — home page shell.
- `components/paste-uploader.tsx` — main client upload workflow.
- `components/session-uploader.tsx` — session upload workflow.
- `components/share-actions.tsx` — copy actions.
- `app/[token]/route.ts` — private blob streaming + expiry enforcement.
- `lib/tokens.ts` — token issuance and parsing; server-only Node crypto.
- `lib/share.ts` — client-safe URL/filename/expiry helpers.
- `lib/config.ts` — TTL, size limits, and config parsing.
- `lib/sessions.ts` — session CRUD backed by Upstash Redis.

## Invariants

- Blob storage is private. Do not switch uploads or reads to public access unless explicitly requested.
- Shared links should point to `/<token>.<ext>`, not raw Blob URLs.
- True expiry is enforced by the app route, not by cleanup timing.
- The extension in `/<token>.<ext>` is for usability; token validity comes from the token itself.
- Client components must not import server-only modules.
- The session API contract is consumed by plugins at the repository root; coordinate request/response changes.
- Telemetry must be opt-in for self-hosters; do not add hard-coded DSNs or analytics that run by default.

## Environment

Required in deployed environments:

- `BLOB_READ_WRITE_TOKEN`
- `CRON_SECRET`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`

Optional:

- `NEXT_PUBLIC_BASE_URL`
- `GLANCE_TTL_MINUTES`
- `GLANCE_MAX_UPLOAD_MB`
- `GLANCE_UPLOAD_TOKEN_TTL_SECONDS`
- `GLANCE_UPLOAD_PROOF_SECRET`
- `GLANCE_CLEANUP_BATCH_SIZE`
- `GLANCE_ALLOW_UNAUTHENTICATED_CRON`
- `NEXT_PUBLIC_VERCEL_ANALYTICS_ENABLED`
- `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN`

Legacy `AGENTPASTE_*` names are accepted where implemented for compatibility.

## Local commands

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run dev
```
