import { notFound } from 'next/navigation';

import { BrandEyebrow } from '@/components/brand-eyebrow';
import { SessionUploader } from '@/components/session-uploader';
import { SiteFooter } from '@/components/site-footer';
import { sessionExists } from '@/lib/sessions';

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!(await sessionExists(id))) {
    notFound();
  }

  return (
    <main className="shell">
      <div className="hero-copy">
        <div className="eyebrow-row">
          <BrandEyebrow href="/" />
          <span className="session-live-badge">
            <span className="session-live-dot" />
            Live session
          </span>
        </div>
        <h1 className="headline">Paste an image for your agent.</h1>
        <p className="lede">
          Your coding agent is waiting. Paste or drop an image and it&apos;ll receive the link instantly.
        </p>
      </div>

      <SessionUploader sessionId={id} />

      <SiteFooter />
    </main>
  );
}
