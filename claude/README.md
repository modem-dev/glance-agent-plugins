# glance.sh plugin for Claude Code

[Claude Code](https://github.com/anthropics/claude-code) plugin that adds glance.sh screenshot tools via MCP.

## What it does

Adds two MCP tools:

- **`glance`** — creates/reuses a live session and returns a URL like `https://glance.sh/s/<id>`
- **`glance_wait`** — waits for the next pasted image and returns `Screenshot: https://glance.sh/<token>.<ext>`

The server keeps a background SSE listener alive, reconnects automatically, and refreshes sessions before they expire.

## Install

Recommended (npm-backed marketplace plugin):

```text
/plugin marketplace add modem-dev/glance-agent-plugins
/plugin install glance-claude@glance-agent-plugins
```

This plugin is distributed as `@modemdev/glance-claude` and installed through Claude Code's plugin marketplace flow.

### Local development (plugin dir)

From this repo root:

```bash
claude --plugin-dir ./agent-plugins/claude
```

Or from inside `agent-plugins/`:

```bash
claude --plugin-dir ./claude
```

## Verify

1. Run `/mcp` and confirm a `glance` server is connected.
2. Ask Claude to call the `glance` tool.
3. Open the returned `https://glance.sh/s/<id>` URL and paste an image.
4. Ask Claude to call `glance_wait`.
5. Confirm Claude receives `Screenshot: <url>`.

## Update / remove

- Update: `/plugin update glance-claude`
- Remove: `/plugin uninstall glance-claude`

If you have multiple plugins with the same name from different marketplaces, use the fully qualified form (`glance-claude@glance-agent-plugins`).

## Publishing (maintainers)

Releases are automated via GitHub Actions.

Prerequisite: configure `NPM_TOKEN` in the `glance-agent-plugins` repository with publish access to `@modemdev/glance-claude`.

1. Bump `version` in both:
   - `claude/package.json`
   - `claude/.claude-plugin/plugin.json`
2. Commit and push to `main`.
3. Create and push a matching tag:

```bash
git tag claude-v0.1.0
git push origin claude-v0.1.0
```

The `Release claude package` workflow validates tag/version alignment, checks for already-published versions, runs `npm pack --dry-run`, and publishes with npm provenance.

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
