# glance.sh plugin for OpenCode

[OpenCode](https://github.com/anomalyco/opencode) plugin that lets your agent request screenshots from you via [glance.sh](https://glance.sh).

## What it does

Starts a glance.sh session **on demand**. Idle OpenCode sessions do not keep a background connection open.

- **On-demand listener** — starts when the `glance` tool is used. It stops after one image, timeout, expiry, cancellation, or a small number of transient retries.
- **`glance` tool** — the LLM calls it when it needs to see something visual. Surfaces the session URL.
- **`glance_wait` tool** — waits for the next paste and returns the image URL.

## Install

Recommended (npm package):

Add the plugin to your global `~/.config/opencode/opencode.json` or project `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@modemdev/glance-opencode"]
}
```

Restart OpenCode. The background session starts when the `glance` tool is used.

Optional: pin a specific version:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@modemdev/glance-opencode@0.1.1"]
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

Prerequisite: configure `NPM_TOKEN` in the `glance` repository with publish access to `@modemdev/glance-opencode`.

1. Bump `version` in `opencode/package.json`.
2. Commit and push to `main`.
3. Create and push a matching tag:

```bash
git tag opencode-v0.1.1
git push origin opencode-v0.1.1
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
LLM calls glance tool
  └─▶ plugin creates session on glance.sh
  └─▶ connects SSE for one wait window
  └─▶ surfaces session URL

LLM calls glance_wait tool
  └─▶ waits for image paste

user pastes image at /s/<id>
  └─▶ SSE emits "image" event
  └─▶ glance_wait returns image URL to LLM
  └─▶ listener stops

no image arrives within ~5 min, session expires, or request is cancelled
  └─▶ listener stops
```

## Requirements

- [OpenCode](https://github.com/anomalyco/opencode) v0.1+
- Bun runtime (ships with OpenCode)

## Configuration

No API keys required — sessions are anonymous and ephemeral (10-minute TTL).

The plugin connects to `https://glance.sh` by default. Once started, the SSE connection is held for up to ~5 minutes, then stops unless the agent invokes glance again.
