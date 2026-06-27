import { renderSocialImage } from '@/lib/social-image';

export const runtime = 'nodejs';
export const alt = 'glance.sh Terms — Acceptable use and service terms.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OGImage() {
  return renderSocialImage({
    section: 'Terms',
    title: 'Terms of Service',
    description: 'Acceptable use and legal terms for glance.sh.',
  });
}
