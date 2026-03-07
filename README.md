# glance.sh agent plugins

[![Integration](https://github.com/modem-dev/glance-agent-plugins/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/modem-dev/glance-agent-plugins/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Supported Agents](https://img.shields.io/badge/agents-pi%20%7C%20OpenCode-blue)](#available-plugins)

Agent integrations for [glance.sh](https://glance.sh) — temporary image sharing for coding agents.

Paste a screenshot in your browser, your agent gets the URL instantly.

## Available plugins

| Agent | Directory | Status |
|---|---|---|
| [pi](https://github.com/mariozechner/pi) | [`pi/`](pi/) | ✅ |
| [OpenCode](https://github.com/anomalyco/opencode) | [`opencode/`](opencode/) | ✅ |

## How it works

Each plugin creates a live session on glance.sh, gives you a URL to open, and waits for you to paste an image. The image URL is returned to the agent over SSE — no manual copy-paste needed.

```
agent ──POST /api/session──▶ { id, url }
agent ──GET  /api/session/<id>/events──▶ SSE (waiting…)
user  ──opens /s/<id>, pastes image──▶ agent receives URL
```

Sessions are anonymous and ephemeral (10-minute TTL). Images expire after 30 minutes.

## Adding a new plugin

Create a directory for your agent (e.g. `cursor/`, `cline/`) with:

1. The integration code
2. A `README.md` with install instructions

Open a PR.

## License

MIT
