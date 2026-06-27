import { head } from '@vercel/blob';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BrandEyebrow } from '@/components/brand-eyebrow';
import { ShareActions } from '@/components/share-actions';
import {
  assetFilenameForToken,
  describeExpiry,
  extensionForContentType,
  formatExpiryUtc,
  parseToken,
  pathForToken,
  sharePathForToken,
} from '@/lib/tokens';
import { getBaseUrl } from '@/lib/url';

type ResultPageProps = {
  params: Promise<{ token: string }>;
};

export default async function ResultPage({ params }: ResultPageProps) {
  const { token } = await params;
  const parsed = parseToken(token);

  if (!parsed) {
    notFound();
  }

  let extension: string | null = null;

  if (!parsed.expired) {
    try {
      const blob = await head(pathForToken(token));
      extension = extensionForContentType(blob.contentType);
    } catch {
      extension = null;
    }
  }

  const baseUrl = await getBaseUrl();
  const sharePath = sharePathForToken(token, extension);
  const shareUrl = baseUrl ? `${baseUrl}${sharePath}` : sharePath;
  const curlCommand = `curl -fsSL "${shareUrl}" -o /tmp/${assetFilenameForToken(token, extension)}`;

  return (
    <main className="shell">
      <BrandEyebrow href="/" />

      <section className="result-grid">
        <div className="preview-frame">
          {!parsed.expired ? (
            <img
              alt="Uploaded image preview"
              className="preview-image"
              src={sharePath}
            />
          ) : (
            <div className="empty-preview">
              <p>This link has expired. Paste a new image to mint a fresh URL.</p>
            </div>
          )}
        </div>

        <div className="share-card">
          <div>
            <p className="eyebrow">{parsed.expired ? 'expired' : 'ready'}</p>
            <h1 className="result-title">
              {parsed.expired ? 'Expired.' : 'Share.'}
            </h1>
            <p className="copy-muted">
              {parsed.expired
                ? `Expired ${formatExpiryUtc(parsed.expiresAt)}`
                : `${describeExpiry(parsed.expiresAt)} · ${formatExpiryUtc(parsed.expiresAt)}`}
            </p>
          </div>

          {!parsed.expired ? (
            <>
              <pre className="share-url">{shareUrl}</pre>
              <pre className="share-command">{curlCommand}</pre>
              <ShareActions curlCommand={curlCommand} homeHref="/" shareUrl={shareUrl} token={token} />
            </>
          ) : (
            <Link className="button" href="/">
              New paste
            </Link>
          )}
        </div>
      </section>
    </main>
  );
}
