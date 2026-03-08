# glance.sh plugin for Codex

[Codex CLI](https://developers.openai.com/codex) integration that adds glance.sh screenshot tools via MCP.

## What it does

Adds two MCP tools:

- **`glance`** — creates/reuses a live session and returns a URL like `https://glance.sh/s/<id>`
- **`glance_wait`** — waits for the next pasted image and returns `Screenshot: https://glance.sh/<token>.<ext>`

The server keeps a background SSE listener alive, reconnects automatically, and refreshes sessions before they expire.

## Install

From this repository:

```bash
codex mcp add glance -- node "$(pwd)/codex/servers/glance-mcp.js"
```

Or with an absolute path from anywhere:

```bash
codex mcp add glance -- node /absolute/path/to/glance-agent-plugins/codex/servers/glance-mcp.js
```

## Verify

1. Confirm the MCP server is configured:

```bash
codex mcp list
codex mcp get glance --json
```

2. Ask Codex to call `glance`.
3. Open the returned `https://glance.sh/s/<id>` URL and paste an image.
4. Ask Codex to call `glance_wait`.
5. Confirm Codex receives `Screenshot: <url>`.

## Update / remove

Update to the latest plugin code:

```bash
codex mcp remove glance
codex mcp add glance -- node /absolute/path/to/glance-agent-plugins/codex/servers/glance-mcp.js
```

Remove:

```bash
codex mcp remove glance
```

## How it works

```text
Codex calls glance
  └─▶ MCP server POST /api/session
  └─▶ returns session URL

Codex calls glance_wait
  └─▶ waits for SSE image event

User pastes image at /s/<id>
  └─▶ glance.sh emits image event
  └─▶ tool returns Screenshot: <url>
```

## Requirements

- Codex CLI with MCP support
- Node.js runtime available to launch the stdio MCP server

## Configuration

Optional environment variable:

- `GLANCE_BASE_URL` (default: `https://glance.sh`)
