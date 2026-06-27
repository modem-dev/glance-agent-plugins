import { BrandEyebrow } from '@/components/brand-eyebrow';
import { PasteUploader } from '@/components/paste-uploader';
import { SiteFooter } from '@/components/site-footer';

export default function HomePage() {
  return (
    <main className="shell">
      <div className="hero-copy">
        <BrandEyebrow />
        <h1 className="headline">Share an image with your coding agent.</h1>
        <p className="lede">
          For agent environments where copy/pasting images is hard.
        </p>
      </div>

      <PasteUploader />

      <div className="agent-plugin-callout">
        <a href="/docs" className="agent-plugin-callout-link">
          Plugins for Claude Code, Codex CLI, OpenCode, or Pi
          <span aria-hidden="true">↗</span>
        </a>
      </div>

      <SiteFooter />
    </main>
  );
}
