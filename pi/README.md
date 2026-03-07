# glance.sh extension for pi

[Pi](https://github.com/mariozechner/pi) extension that lets your agent request screenshots from you via [glance.sh](https://glance.sh).

## What it does

Maintains a **persistent background session** on glance.sh. Paste an image anytime — the agent receives it instantly.

- **Background listener** — starts when pi launches, reconnects automatically, refreshes sessions before they expire.
- **`glance` tool** — the LLM calls it when it needs to see something visual. Surfaces the session URL and waits for the next paste.
- **`/glance` command** — type it to see the current session URL.
- **Multiple images** — paste as many images as you want. Each one is injected into the conversation as `Screenshot: <url>`.

## Install

Symlink or copy `glance.ts` into your pi extensions directory:

```bash
# symlink (recommended — stays up to date with git pulls)
ln -s "$(pwd)/glance.ts" ~/.pi/extensions/glance.ts

# or copy
cp glance.ts ~/.pi/extensions/glance.ts
```

Restart pi. The background session starts automatically.

## How it works

```
pi starts
  └─▶ create session on glance.sh
  └─▶ connect SSE (background, auto-reconnect)

user pastes image at /s/<id>
  └─▶ SSE emits "image" event
  └─▶ extension injects "Screenshot: <url>" into conversation

session expires (~10 min)
  └─▶ extension creates new session, reconnects
```

The `glance` tool reuses the existing background session — it just surfaces the URL and waits for the next image rather than creating a new session each time.

## Requirements

- [pi](https://github.com/mariozechner/pi) coding agent
- Node.js with global `fetch` (Node 18+)

## Configuration

No API keys required — sessions are anonymous and ephemeral (10-minute TTL).

The extension connects to `https://glance.sh` by default. The SSE connection is held for ~5 minutes per cycle, with automatic reconnection.
