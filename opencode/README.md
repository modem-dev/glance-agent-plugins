# glance.sh plugin for OpenCode

[OpenCode](https://github.com/anomalyco/opencode) plugin that lets your agent request screenshots from you via [glance.sh](https://glance.sh).

## What it does

Maintains a **persistent background session** on glance.sh. Paste an image anytime — the agent receives it instantly.

- **Background listener** — starts when OpenCode launches, reconnects automatically, refreshes sessions before they expire.
- **`glance` tool** — the LLM calls it when it needs to see something visual. Surfaces the session URL.
- **`glance_wait` tool** — waits for the next paste and returns the image URL.
- **Multiple images** — paste as many images as you want during a session.

## Install

Recommended (npm package):

Add the plugin to your global `~/.config/opencode/opencode.json` or project `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@modemdev/glance-opencode"]
}
```

Restart OpenCode. The background session starts automatically.

Optional: pin a specific version:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@modemdev/glance-opencode@0.1.0"]
}
```

## Verify

Ask the agent to call the `glance` tool. You should get a session URL like `https://glance.sh/s/<id>`.

Then call `glance_wait` and paste an image in the browser tab — it should return a `Screenshot: https://glance.sh/<token>.<ext>` URL.

## Update / remove

- If you use `@modemdev/glance-opencode` without pinning, OpenCode checks for newer versions at startup.
- If you pin a version, bump it in your `plugin` list when you want to upgrade.
- To remove, delete the package from your `plugin` list and restart OpenCode.

## Publishing (maintainers)

Releases are automated via GitHub Actions.

Prerequisite: configure `NPM_TOKEN` in the `glance-agent-plugins` repository with publish access to `@modemdev/glance-opencode`.

1. Bump `version` in `opencode/package.json`.
2. Commit and push to `main`.
3. Create and push a matching tag:

```bash
git tag opencode-v0.1.0
git push origin opencode-v0.1.0
```

The `Release opencode package` workflow validates the tag/version match and publishes with npm provenance.
You can also run the workflow manually in dry-run mode from Actions.

## Manual install (legacy)

If you prefer local file management, symlink or copy `glance.ts` into your OpenCode plugins directory:

```bash
# symlink (recommended — stays up to date with git pulls)
ln -s "$(pwd)/glance.ts" ~/.config/opencode/plugins/glance.ts

# or per-project
ln -s "$(pwd)/glance.ts" .opencode/plugins/glance.ts
```

## How it works

```text
opencode starts
  └─▶ plugin creates session on glance.sh
  └─▶ connects SSE (background, auto-reconnect)

LLM calls glance tool
  └─▶ surfaces session URL

LLM calls glance_wait tool
  └─▶ waits for image paste

user pastes image at /s/<id>
  └─▶ SSE emits "image" event
  └─▶ glance_wait returns image URL to LLM

session expires (~10 min)
  └─▶ plugin creates new session, reconnects
```

## Requirements

- [OpenCode](https://github.com/anomalyco/opencode) v0.1+
- Bun runtime (ships with OpenCode)

## Configuration

No API keys required — sessions are anonymous and ephemeral (10-minute TTL).

The plugin connects to `https://glance.sh` by default. The SSE connection is held for ~5 minutes per cycle, with automatic reconnection.
