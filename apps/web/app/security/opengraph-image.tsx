import { renderSocialImage } from '@/lib/social-image';

export const runtime = 'nodejs';
export const alt = 'glance.sh Security — Encryption at rest, private storage, and automatic deletion.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OGImage() {
  return renderSocialImage({
    section: 'Security',
    title: 'Private by default, ephemeral by design.',
    description: 'See how glance.sh handles storage, expiry, encryption, and infrastructure.',
  });
}
