# glance.sh extension for pi

[Pi](https://github.com/mariozechner/pi) extension that lets your agent request screenshots from you via [glance.sh](https://glance.sh).

## What it does

Registers a `glance` **tool** and a `/glance` **command**:

- **Tool** — the LLM calls it when it needs to see something visual (your screen, a UI, an error dialog). The agent creates a session, you paste a screenshot in your browser, the agent receives the image URL.
- **Command** — you type `/glance` in the pi prompt to proactively share a screenshot with the agent.

## Install

Symlink or copy `glance.ts` into your pi extensions directory:

```bash
# symlink (recommended — stays up to date with git pulls)
ln -s "$(pwd)/glance.ts" ~/.pi/extensions/glance.ts

# or copy
cp glance.ts ~/.pi/extensions/glance.ts
```

Restart pi. The `glance` tool and `/glance` command are now available.

## How it works

```
agent ──POST /api/session──▶ { id, url }
agent ──GET  /api/session/<id>/events──▶ SSE (waiting…)
user  ──opens /s/<id>, pastes image──▶ agent receives URL
```

1. Creates a live session on glance.sh.
2. Shows you the session URL (status bar + notification).
3. Connects via SSE and waits up to ~5 minutes.
4. When you paste an image, the URL is returned to the LLM.

No API keys required — sessions are anonymous and ephemeral (10-minute TTL).

## Requirements

- [pi](https://github.com/mariozechner/pi) coding agent
- Node.js with global `fetch` (Node 18+)
