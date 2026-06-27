import type { Metadata } from 'next';

import { BrandEyebrow } from '@/components/brand-eyebrow';
import { SiteFooter } from '@/components/site-footer';

const SECURITY_DESCRIPTION =
  'Private storage, encryption at rest, short-lived links, and automatic deletion for glance.sh uploads.';

export const metadata: Metadata = {
  title: 'Security — glance.sh',
  description: SECURITY_DESCRIPTION,
  openGraph: {
    title: 'Security — glance.sh',
    description: SECURITY_DESCRIPTION,
    url: 'https://glance.sh/security',
  },
  twitter: {
    title: 'Security — glance.sh',
    description: SECURITY_DESCRIPTION,
  },
};

export default function SecurityPage() {
  return (
    <main className="shell">
      <div className="hero-copy">
        <BrandEyebrow href="/" />
        <h1 className="headline">Security</h1>
      </div>

      <section className="terms-body">
        <p>
          glance.sh is designed to be ephemeral. Images are temporary,
          storage is private, and data is automatically deleted. Here is how
          we protect your uploads.
        </p>

        <h2>Private storage</h2>
        <p>
          All uploads are stored in a private Vercel Blob store. Blobs are
          never publicly accessible. Every request is validated and streamed
          through the application, which checks expiry before serving any
          content.
        </p>

        <h2>Encryption at rest</h2>
        <p>
          Every image is encrypted in your browser before it leaves your
          device. The encryption key is derived from the share token embedded
          in the URL, so only someone with the exact link can decrypt the
          image. The server and blob store never see plaintext image data.
        </p>

        <h2>Automatic expiry &amp; deletion</h2>
        <p>
          Every upload is assigned a short-lived token that expires within
          30&nbsp;minutes. After expiry, the image can no longer be accessed.
          Expired blobs are permanently deleted shortly after expiration.
        </p>

        <h2>No accounts, no tracking</h2>
        <p>
          glance.sh does not require sign-up, does not set cookies, and does
          not collect personal information.
        </p>

        <h2>Link security</h2>
        <p>
          Uploaded images are only accessible via a URL with an embedded
          unique token, generated and displayed once. Each token is created
          using <code>node:crypto</code> with over 768&nbsp;quadrillion
          possible combinations. Only someone with the exact link can access
          an image, and only before it expires.
        </p>

        <h2>Infrastructure</h2>
        <p>
          glance.sh runs on Vercel with TLS everywhere. All traffic between
          your browser, the application, and storage is encrypted in transit.
        </p>

        <h2>Reporting issues</h2>
        <p>
          If you discover a security vulnerability or have concerns, contact{' '}
          <a href="mailto:security@modem.dev">security@modem.dev</a>.
        </p>

        <h2>Sub-processors</h2>
        <p>
          The following third-party services process data on our behalf:
        </p>
        <ul>
          <li><strong>Vercel</strong> &mdash; hosting, edge network, and blob storage</li>
          <li><strong>Upstash</strong> &mdash; Redis for live-session coordination</li>
        </ul>

        <p className="copy-muted" style={{ marginTop: 32 }}>
          Last updated: March 2026
        </p>
      </section>

      <SiteFooter />
    </main>
  );
}
