# glance.sh extension for pi

[Pi](https://github.com/mariozechner/pi) extension that lets your agent request screenshots from you via [glance.sh](https://glance.sh).

## What it does

Maintains a **persistent background session** on glance.sh. Paste an image anytime — the agent receives it instantly.

- **Background listener** — starts when pi launches, reconnects automatically, refreshes sessions before they expire.
- **`glance` tool** — the LLM calls it when it needs to see something visual. Surfaces the session URL and waits for the next paste.
- **`/glance` command** — type it to see the current session URL.
- **Multiple images** — paste as many images as you want. Each one is injected into the conversation as `Screenshot: <url>`.

## Install

Recommended (npm package):

```bash
pi install npm:@modemdev/glance-pi
```

If you are working from a local checkout instead:

```bash
# from this directory (agent-plugins/pi)
pi install .

# from the main repo root
pi install ./agent-plugins/pi
```

Then restart pi or run `/reload`.

## Verify

Run:

```text
/glance
```

You should see a session URL like `https://glance.sh/s/<id>`.

## Update / remove

```bash
pi update
pi remove npm:@modemdev/glance-pi
```

For a local path install, remove that path from your pi settings (or run `pi remove` with the same path you installed).

## Publishing (maintainers)

Releases are automated via GitHub Actions.

Prerequisite: configure `NPM_TOKEN` in the `glance-agent-plugins` repository with publish access to `@modemdev/glance-pi`.

1. Bump `version` in `pi/package.json`.
2. Commit and push to `main`.
3. Create and push a matching tag:

```bash
git tag pi-v0.1.0
git push origin pi-v0.1.0
```

The `Release pi package` workflow validates the tag/version match and publishes with npm provenance.
You can also run the workflow manually in dry-run mode from Actions.

## Manual install (legacy)

If you prefer manual file management, symlink or copy `glance.ts` into your pi extensions directory:

```bash
mkdir -p ~/.pi/agent/extensions
ln -s "$(pwd)/glance.ts" ~/.pi/agent/extensions/glance.ts
# or:
cp glance.ts ~/.pi/agent/extensions/glance.ts
```

## How it works

```text
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
