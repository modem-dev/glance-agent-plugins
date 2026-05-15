'use client';

import { upload } from '@vercel/blob/client';
import { useEffect, useRef, useState } from 'react';

import { CheckIcon, CopyIcon, ShareActions } from '@/components/share-actions';
import { encrypt } from '@/lib/encryption';
import { MAX_UPLOAD_MB, SHARE_TTL_LABEL } from '@/lib/config';
import {
  assetFilenameForToken,
  describeExpiry,
  extensionForContentType,
  formatExpiryUtc,
  sharePathForToken,
} from '@/lib/share';

const ACCEPTED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
];

type UploadState = 'idle' | 'issuing' | 'uploading' | 'sent' | 'error';

type IssueResponse = {
  expiresAt: number;
  pathname: string;
  token: string;
  uploadProof: string;
};

type SentRecord = {
  curlCommand: string;
  expiresAt: number;
  sharePath: string;
  shareUrl: string;
  token: string;
};

export function SessionUploader({ sessionId }: { sessionId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pasteHint, setPasteHint] = useState('Paste (⌘V)');
  const [status, setStatus] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<SentRecord[]>([]);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  useEffect(() => {
    const isMac = /mac|iphone|ipad|ipod/i.test(navigator.platform);
    setPasteHint(isMac ? 'Paste (⌘V)' : 'Paste (Ctrl+V)');
  }, []);

  async function handleFile(file: File) {
    if (status === 'issuing' || status === 'uploading') return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Only PNG, JPG, WebP, GIF, and AVIF images are allowed.');
      setStatus('error');
      return;
    }

    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`Images must be ${MAX_UPLOAD_MB} MB or smaller.`);
      setStatus('error');
      return;
    }

    setError(null);
    setProgress(0);
    setStatus('issuing');

    try {
      const issueRes = await fetch('/api/issue', {
        method: 'POST',
        cache: 'no-store',
      });

      if (!issueRes.ok) {
        const payload = (await issueRes.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(payload?.error ?? 'Could not prepare the upload.');
        setStatus('error');
        return;
      }

      const issued = (await issueRes.json()) as IssueResponse;
      setStatus('uploading');

      const plaintext = await file.arrayBuffer();
      const ciphertext = await encrypt(plaintext, file.type, issued.token);
      const encryptedBlob = new Blob([ciphertext], {
        type: 'application/octet-stream',
      });

      await upload(issued.pathname, encryptedBlob, {
        access: 'private',
        clientPayload: issued.uploadProof,
        contentType: 'application/octet-stream',
        handleUploadUrl: '/api/upload',
        onUploadProgress(event) {
          setProgress(event.percentage);
        },
      });

      const extension = extensionForContentType(file.type);
      const sharePath = sharePathForToken(issued.token, extension);
      const origin = window.location.origin.replace(/\/\/www\./i, '//');
      const shareUrl = `${origin}${sharePath}`;

      // Push to session
      const pushRes = await fetch(`/api/session/${sessionId}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: shareUrl, expiresAt: issued.expiresAt }),
      });

      if (!pushRes.ok) {
        setError('Session expired or not found.');
        setStatus('error');
        return;
      }

      const filename = assetFilenameForToken(issued.token, extension);

      setSent((prev) => [
        {
          token: issued.token,
          sharePath,
          shareUrl,
          expiresAt: issued.expiresAt,
          curlCommand: `curl -fsSL "${shareUrl}" -o /tmp/${filename}`,
        },
        ...prev,
      ]);
      setStatus('sent');
      setProgress(0);

      // Reset to idle after a moment so user can paste again
      setTimeout(() => setStatus('idle'), 2000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Upload failed.');
      setStatus('error');
    }
  }

  // Global paste listener
  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (!item.type.startsWith('image/')) continue;
        const file = item.getAsFile();
        if (!file) continue;
        event.preventDefault();
        void handleFile(file);
        return;
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [status]);

  // Global drag & drop
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);

  useEffect(() => {
    function onDragEnter(e: DragEvent) {
      e.preventDefault();
      dragCounter.current += 1;
      setDragging(true);
    }
    function onDragOver(e: DragEvent) {
      e.preventDefault();
    }
    function onDragLeave(e: DragEvent) {
      e.preventDefault();
      dragCounter.current -= 1;
      if (dragCounter.current <= 0) {
        dragCounter.current = 0;
        setDragging(false);
      }
    }
    function onDrop(e: DragEvent) {
      e.preventDefault();
      dragCounter.current = 0;
      setDragging(false);
      const file = e.dataTransfer?.files[0];
      if (file) void handleFile(file);
    }
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [status]);

  return (
    <div className="uploader">
      <div className={`dropzone${dragging ? ' dropzone-active' : ''}`}>
        {status === 'sent' ? (
          <>
            <p className="dropzone-title session-sent">✓ Sent to agent</p>
            <p className="dropzone-copy session-return-hint">
              Switch back to your agent — it received the image url
            </p>
          </>
        ) : (
          <>
            <p className="dropzone-title">{pasteHint}</p>
            <p className="dropzone-copy">or drag & drop / choose an image</p>
          </>
        )}

        <button
          className="button"
          disabled={status === 'issuing' || status === 'uploading'}
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          Choose image
        </button>

        <input
          accept={ACCEPTED_TYPES.join(',')}
          className="hidden-input"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void handleFile(file);
          }}
          ref={inputRef}
          type="file"
        />

        <p className="dropzone-meta">
          PNG JPG WEBP GIF AVIF · {MAX_UPLOAD_MB} MB · {SHARE_TTL_LABEL} TTL
        </p>
      </div>

      {(status === 'issuing' || status === 'uploading' || status === 'error') && (
        <div
          className={`status-row${status === 'error' ? ' status-error' : ''}`}
          aria-live="polite"
        >
          <span className="status-label">
            {status === 'issuing' && 'Preparing upload...'}
            {status === 'uploading' && `Uploading... ${Math.round(progress)}%`}
            {status === 'error' && error}
          </span>

          {status === 'uploading' && (
            <div aria-hidden="true" className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${Math.max(progress, 6)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {sent.length > 0 && (
        <section className="upload-list" aria-label="sent images">
          <div className="upload-list-head">
            <p className="eyebrow">Sent</p>
            <p className="copy-muted">
              {sent.length} image{sent.length === 1 ? '' : 's'}
            </p>
          </div>

          {sent.map((item) => (
            <article className="upload-card" key={item.token}>
              <a
                className="upload-card-preview"
                href={item.sharePath}
                rel="noreferrer"
                target="_blank"
              >
                <img
                  alt="Uploaded image preview"
                  className="upload-card-image"
                  loading="lazy"
                  src={item.sharePath}
                />
              </a>

              <div className="upload-card-body">
                <div className="url-bar">
                  <pre className="share-url upload-card-url">{item.shareUrl}</pre>
                  <button
                    aria-label="Copy URL"
                    className="url-bar-copy"
                    onClick={() => {
                      void navigator.clipboard.writeText(item.shareUrl);
                      setCopiedUrl(item.token);
                      setTimeout(
                        () =>
                          setCopiedUrl((current) =>
                            current === item.token ? null : current,
                          ),
                        1500,
                      );
                    }}
                    type="button"
                  >
                    {copiedUrl === item.token ? <CheckIcon /> : <CopyIcon />}
                  </button>
                </div>

                <ShareActions
                  curlCommand={item.curlCommand}
                  shareUrl={item.shareUrl}
                  token={item.token}
                />

                <p className="copy-muted upload-card-expiry">
                  {describeExpiry(item.expiresAt)} · {formatExpiryUtc(item.expiresAt)}
                </p>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
