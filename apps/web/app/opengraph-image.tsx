import { renderSocialImage } from '@/lib/social-image';

export const runtime = 'nodejs';
export const alt = 'glance.sh — Share an image with your coding agent.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OGImage() {
  return renderSocialImage({
    title: 'Share an image with your coding agent.',
    description: 'For terminal environments where copy/pasting images is hard.',
  });
}
