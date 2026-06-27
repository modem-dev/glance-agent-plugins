'use client';

import * as Sentry from '@sentry/nextjs';
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

type IssueResponse = {
  expiresAt: number;
  pathname: string;
  token: string;
  uploadProof: string;
};

type UploadState = 'idle' | 'issuing' | 'uploading' | 'error';

type UploadRecord = {
  curlCommand: string;
  expiresAt: number;
  filename: string;
  sharePath: string;
  shareUrl: string;
  token: string;
};

const ACCEPTED_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
];

export function PasteUploader() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pasteHint, setPasteHint] = useState('Paste (⌘V)');
  const [status, setStatus] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [activeFileName, setActiveFileName] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  useEffect(() => {
    const isMac = /mac|iphone|ipad|ipod/i.test(navigator.platform);
    setPasteHint(isMac ? 'Paste (⌘V)' : 'Paste (Ctrl+V)');
  }, []);

  type UploadSource = 'paste' | 'drag' | 'choose';

  async function handleFile(file: File, source: UploadSource = 'choose') {
    if (status === 'issuing' || status === 'uploading') {
      return;
    }

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
    setActiveFileName(file.name || 'clipboard-image');
    setStatus('issuing');

    const issueResponse = await fetch('/api/issue', {
      method: 'POST',
      cache: 'no-store',
    });

    if (!issueResponse.ok) {
      const payload = (await issueResponse.json().catch(() => null)) as
        | { error?: string }
        | null;

      setError(payload?.error ?? 'Could not prepare the upload.');
      setStatus('error');
      return;
    }

    const issued = (await issueResponse.json()) as IssueResponse;

    try {
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
      const filename = assetFilenameForToken(issued.token, extension);

      setUploads((current) => [
        {
          token: issued.token,
          expiresAt: issued.expiresAt,
          filename,
          sharePath,
          shareUrl,
          curlCommand: `curl -fsSL "${shareUrl}" -o /tmp/${filename}`,
        },
        ...current,
      ]);

      setStatus('idle');
      setProgress(0);
      setActiveFileName(null);

      Sentry.metrics.count('upload.completed', 1, {
        attributes: { source },
      });
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : 'Upload failed.';

      setError(message);
      setStatus('error');
    }
  }

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const items = event.clipboardData?.items;
      if (!items || status === 'issuing' || status === 'uploading') {
        return;
      }

      for (const item of items) {
        if (!item.type.startsWith('image/')) {
          continue;
        }

        const file = item.getAsFile();
        if (!file) {
          continue;
        }

        event.preventDefault();
        void handleFile(file, 'paste');
        return;
      }
    }

    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('paste', onPaste);
    };
  }, [status]);

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
      if (file) void handleFile(file, 'drag');
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
        <p className="dropzone-title">{pasteHint}</p>
        <p className="dropzone-copy">or drag & drop / choose an image</p>

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

            if (!file) {
              return;
            }

            void handleFile(file);
          }}
          ref={inputRef}
          type="file"
        />

        <p className="dropzone-meta">
          PNG JPG WEBP GIF AVIF · {MAX_UPLOAD_MB} MB · {SHARE_TTL_LABEL} TTL
        </p>
      </div>

      {status !== 'idle' && (
        <div
          className={`status-row${status === 'error' ? ' status-error' : ''}`}
          aria-live="polite"
        >
          <span className="status-label">
            {status === 'issuing' && 'Preparing upload token...'}
            {status === 'uploading' &&
              `Uploading ${activeFileName ?? 'image'}... ${Math.round(progress)}%`}
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

      {uploads.length > 0 ? (
        <section className="upload-list" aria-label="recent uploads">
          <div className="upload-list-head">
            <p className="eyebrow">Recent</p>
            <p className="copy-muted">
              {uploads.length} link{uploads.length === 1 ? '' : 's'}
            </p>
          </div>

          {uploads.map((uploadItem) => (
            <article className="upload-card" key={uploadItem.token}>
              <a
                className="upload-card-preview"
                href={uploadItem.sharePath}
                rel="noreferrer"
                target="_blank"
              >
                <img
                  alt="Uploaded image preview"
                  className="upload-card-image"
                  loading="lazy"
                  src={uploadItem.sharePath}
                />
              </a>

              <div className="upload-card-body">
                <div className="url-bar">
                  <pre className="share-url upload-card-url">{uploadItem.shareUrl}</pre>
                  <button
                    className="url-bar-copy"
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(uploadItem.shareUrl);
                      setCopiedUrl(uploadItem.token);
                      setTimeout(() => setCopiedUrl((c) => c === uploadItem.token ? null : c), 1500);
                    }}
                    aria-label="Copy URL"
                  >
                    {copiedUrl === uploadItem.token ? <CheckIcon /> : <CopyIcon />}
                  </button>
                </div>
                <ShareActions
                  curlCommand={uploadItem.curlCommand}
                  shareUrl={uploadItem.shareUrl}
                  token={uploadItem.token}
                />
                <p className="copy-muted upload-card-expiry">
                  {describeExpiry(uploadItem.expiresAt)} · {formatExpiryUtc(uploadItem.expiresAt)}
                </p>
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </div>
  );
}
