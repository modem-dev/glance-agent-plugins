import type { Metadata } from 'next';

import { BrandEyebrow } from '@/components/brand-eyebrow';
import { DocsCopyBlock } from '@/components/docs-copy-block';
import { SiteFooter } from '@/components/site-footer';

export const metadata: Metadata = {
  title: 'Plugins — glance.sh',
  description: 'Install glance plugins for Claude Code, Codex CLI, OpenCode, and Pi.',
  openGraph: {
    title: 'Plugins — glance.sh',
    description: 'Install glance plugins for Claude Code, Codex CLI, OpenCode, and Pi.',
    url: 'https://glance.sh/docs',
  },
  twitter: {
    title: 'Plugins — glance.sh',
    description: 'Install glance plugins for Claude Code, Codex CLI, OpenCode, and Pi.',
  },
};

export default function DocsPage() {
  return (
    <main className="shell">
      <div className="hero-copy">
        <BrandEyebrow href="/" />
        <h1 className="headline">Plugins</h1>
        <p className="lede">Share images directly with your active coding agent session.</p>
      </div>

      <section className="terms-body docs-body">
        <article className="docs-section">
          <div className="docs-section-head">
            <img src="/logos/claude-code.svg" alt="Claude Code logo" className="docs-agent-logo" />
            <h2>Claude Code</h2>
          </div>
          <div className="docs-steps">
            <div className="docs-step">
              <p>Add the marketplace:</p>
              <DocsCopyBlock
                code="/plugin marketplace add modem-dev/glance"
                copyLabel="Copy Claude marketplace command"
              />
            </div>
            <div className="docs-step">
              <p>Install the plugin:</p>
              <DocsCopyBlock code="/plugin install glance-claude" copyLabel="Copy Claude install command" />
            </div>
            <p className="docs-step">Restart, then ask Claude Code to use the <code>glance</code> tool.</p>
          </div>
        </article>

        <article className="docs-section">
          <div className="docs-section-head">
            <img src="/logos/codex.svg" alt="Codex logo" className="docs-agent-logo" />
            <h2>Codex</h2>
          </div>
          <div className="docs-steps">
            <div className="docs-step">
              <p>Install the MCP server:</p>
              <DocsCopyBlock
                code="codex mcp add glance -- npx -y -p @modemdev/glance-codex glance-codex"
                copyLabel="Copy Codex install command"
              />
            </div>
            <div className="docs-step">
              <p>Verify setup:</p>
              <DocsCopyBlock code="codex mcp get glance --json" copyLabel="Copy Codex verify command" />
            </div>
            <p className="docs-step">Ask Codex to use the <code>glance</code> tool.</p>
          </div>
        </article>

        <article className="docs-section">
          <div className="docs-section-head">
            <img src="/logos/opencode.svg" alt="OpenCode logo" className="docs-agent-logo" />
            <h2>OpenCode</h2>
          </div>
          <div className="docs-steps">
            <div className="docs-step">
              <p>
                Add the plugin to your <code>opencode.json</code>:
              </p>
              <DocsCopyBlock
                code={`{
  "plugin": ["@modemdev/glance-opencode"]
}`}
                copyLabel="Copy OpenCode config snippet"
              />
            </div>
            <p className="docs-step">Restart, then ask OpenCode to use the <code>glance</code> tool.</p>
          </div>
        </article>

        <article className="docs-section">
          <div className="docs-section-head">
            <img src="/logos/pi.svg" alt="Pi logo" className="docs-agent-logo" />
            <h2>Pi</h2>
          </div>
          <div className="docs-steps">
            <div className="docs-step">
              <p>Install the extension package:</p>
              <DocsCopyBlock code="pi install npm:@modemdev/glance-pi" copyLabel="Copy pi install command" />
            </div>
            <p className="docs-step">Reload or restart pi, then use <code>/glance</code>.</p>
          </div>
        </article>
      </section>

      <SiteFooter />
    </main>
  );
}
