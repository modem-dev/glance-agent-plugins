# glance.sh plugin for OpenCode

[OpenCode](https://github.com/anomalyco/opencode) plugin that lets your agent request screenshots from you via [glance.sh](https://glance.sh).

## What it does

Maintains a **persistent background session** on glance.sh. Paste an image anytime — the agent receives it instantly.

- **Background listener** — starts when OpenCode launches, reconnects automatically, refreshes sessions before they expire.
- **`glance` tool** — the LLM calls it when it needs to see something visual. Surfaces the session URL and waits for the next paste.
- **Multiple images** — paste as many images as you want during a session.

## Install

Symlink or copy `glance.ts` into your OpenCode plugins directory:

```bash
# symlink (recommended — stays up to date with git pulls)
ln -s "$(pwd)/glance.ts" ~/.config/opencode/plugins/glance.ts

# or per-project
ln -s "$(pwd)/glance.ts" .opencode/plugins/glance.ts
```

Restart OpenCode. The background session starts automatically.

## How it works

```
opencode starts
  └─▶ plugin creates session on glance.sh
  └─▶ connects SSE (background, auto-reconnect)

LLM calls glance tool
  └─▶ surfaces session URL
  └─▶ waits for image paste

user pastes image at /s/<id>
  └─▶ SSE emits "image" event
  └─▶ tool returns image URL to LLM

session expires (~10 min)
  └─▶ plugin creates new session, reconnects
```

## Requirements

- [OpenCode](https://github.com/anomalyco/opencode) v0.1+
- Bun runtime (ships with OpenCode)

## Configuration

No API keys required — sessions are anonymous and ephemeral (10-minute TTL).

The plugin connects to `https://glance.sh` by default. The SSE connection is held for ~5 minutes per cycle, with automatic reconnection.
