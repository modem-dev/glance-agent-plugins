# glance.sh plugin for Claude Code

[Claude Code](https://github.com/anthropics/claude-code) plugin that adds glance.sh screenshot tools via MCP.

## What it does

Adds two MCP tools:

- **`glance`** — creates/reuses a live session and returns a URL like `https://glance.sh/s/<id>`
- **`glance_wait`** — waits for the next pasted image and returns `Screenshot: https://glance.sh/<token>.<ext>`

The server keeps a background SSE listener alive, reconnects automatically, and refreshes sessions before they expire.

## Install

### Option A: Local development (fastest)

From this repo root:

```bash
claude --plugin-dir ./agent-plugins/claude
```

Or from inside `agent-plugins/`:

```bash
claude --plugin-dir ./claude
```

### Option B: Marketplace install

1. Add this repo as a marketplace:

```text
/plugin marketplace add modem-dev/glance-agent-plugins
```

2. Install `glance-claude` from the **Discover** tab in `/plugin`.

(You can also install by command if your marketplace alias resolves to `glance-agent-plugins`:
`/plugin install glance-claude@glance-agent-plugins`.)

## Verify

1. Run `/mcp` and confirm a `glance` server is connected.
2. Ask Claude to call the `glance` tool.
3. Open the returned `https://glance.sh/s/<id>` URL and paste an image.
4. Ask Claude to call `glance_wait`.
5. Confirm Claude receives `Screenshot: <url>`.

## Update / remove

- Update: `/plugin update glance-claude`
- Remove: `/plugin uninstall glance-claude`

(If installed in a specific scope, use the corresponding scope option in the plugin manager.)

## How it works

```text
Claude calls glance
  └─▶ MCP server POST /api/session
  └─▶ returns session URL

Claude calls glance_wait
  └─▶ waits for SSE image event

User pastes image at /s/<id>
  └─▶ glance.sh emits image event
  └─▶ tool returns Screenshot: <url>
```

## Requirements

- Claude Code with plugin support
- Node.js runtime available to Claude Code (for stdio MCP server)

## Configuration

Optional environment variable:

- `GLANCE_BASE_URL` (default: `https://glance.sh`)
