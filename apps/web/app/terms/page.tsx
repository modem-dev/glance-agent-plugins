import type { Metadata } from 'next';

import { BrandEyebrow } from '@/components/brand-eyebrow';
import { SiteFooter } from '@/components/site-footer';

export const metadata: Metadata = {
  title: 'Terms of Service — glance.sh',
  description: 'Acceptable use policy and service terms for glance.sh.',
  openGraph: {
    title: 'Terms of Service — glance.sh',
    description: 'Acceptable use policy and service terms for glance.sh.',
    url: 'https://glance.sh/terms',
  },
  twitter: {
    title: 'Terms of Service — glance.sh',
    description: 'Acceptable use policy and service terms for glance.sh.',
  },
};

export default function TermsPage() {
  return (
    <main className="shell">
      <div className="hero-copy">
        <BrandEyebrow href="/" />
        <h1 className="headline">Terms of Service</h1>
      </div>

      <section className="terms-body">
        <p>
          glance.sh is operated by{' '}
          <a href="https://modem.dev" target="_blank" rel="noreferrer">
            Modem Labs Inc.
          </a>{' '}
          (&quot;Modem&quot;). By using this service you agree to these terms
          and to{' '}
          <a
            href="https://modem.dev/terms-of-service"
            target="_blank"
            rel="noreferrer"
          >
            Modem&apos;s Terms of Service
          </a>
          .
        </p>

        <h2>What this service does</h2>
        <p>
          glance.sh accepts image uploads and provides temporary, shareable
          URLs. All uploads auto-expire within 30 minutes and are permanently
          deleted.
        </p>

        <h2>Acceptable use</h2>
        <p>You may not upload content that is:</p>
        <ul>
          <li>Illegal, abusive, or harmful</li>
          <li>Sexually explicit or exploitative</li>
          <li>Infringing on intellectual property rights</li>
          <li>Malware, phishing, or deceptive material</li>
        </ul>
        <p>
          Uploads are automatically screened. Content that violates this policy
          is deleted immediately and may result in your access being
          restricted.
        </p>

        <h2>No warranty</h2>
        <p>
          This service is provided &quot;as is&quot; without warranty of any
          kind. Modem may modify, suspend, or discontinue glance.sh at any
          time without notice. We are not responsible for any data loss.
        </p>

        <h2>Content removal &amp; abuse</h2>
        <p>
          Modem reserves the right to delete any uploaded content at any time
          for any reason. To report abuse or request content removal, contact{' '}
          <a href="mailto:support@modem.dev">support@modem.dev</a>.
        </p>

        <h2>Liability</h2>
        <p>
          To the maximum extent permitted by law, Modem shall not be liable
          for any indirect, incidental, special, or consequential damages
          arising from your use of this service.
        </p>

        <p className="copy-muted" style={{ marginTop: 32 }}>
          Last updated: March 2026
        </p>
      </section>

      <SiteFooter />
    </main>
  );
}
