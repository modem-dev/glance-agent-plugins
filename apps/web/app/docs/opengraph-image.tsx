import { renderSocialImage } from '@/lib/social-image';

export const runtime = 'nodejs';
export const alt = 'glance.sh Docs — Plugin setup for Claude Code, Codex CLI, OpenCode, and Pi.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OGImage() {
  return renderSocialImage({
    section: 'Docs',
    title: 'Plugin setup for coding agents.',
    description: 'Install glance for Claude Code, Codex CLI, OpenCode, and Pi.',
  });
}
