# glance.sh extension for pi

[Pi](https://github.com/mariozechner/pi) extension for [Glance image sharing](https://glance.sh). Lets your agent request screenshots from you.

## What it does

Starts a glance.sh session **on demand**. Idle pi sessions do not keep a background connection open.

- **On-demand listener** — starts when `/glance` or the `glance` tool is used. It stops after one image, timeout, expiry, cancellation, or a small number of transient retries.
- **`glance` tool** — the LLM calls it when it needs to see something visual. Surfaces the session URL and waits for the next paste.
- **`/glance` command** — type it to create/show the current session URL and open one wait window.

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
git tag pi-v0.1.1
git push origin pi-v0.1.1
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
user or LLM invokes /glance or the glance tool
  └─▶ create session on glance.sh
  └─▶ connect SSE for one wait window

user pastes image at /s/<id>
  └─▶ SSE emits "image" event
  └─▶ extension injects "Screenshot: <url>" into conversation
  └─▶ listener stops

no image arrives within ~5 min, session expires, or request is cancelled
  └─▶ listener stops
```

The `glance` tool reuses an active session when one exists; otherwise it creates a session and starts a single wait window.

## Requirements

- [pi](https://github.com/mariozechner/pi) coding agent
- Node.js with global `fetch` (Node 18+)

## Configuration

No API keys required — sessions are anonymous and ephemeral (10-minute TTL).

The extension connects to `https://glance.sh` by default. Once started, the SSE connection is held for up to ~5 minutes, then stops unless the user or agent invokes glance again.
