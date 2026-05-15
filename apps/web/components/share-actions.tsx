'use client';

import Link from 'next/link';
import { useState } from 'react';

type CopyTarget = 'curl' | 'ocr' | 'prompt' | 'url' | null;
type OcrState = 'idle' | 'loading' | 'done' | 'error';

type ShareActionsProps = {
  curlCommand: string;
  homeHref?: string;
  shareUrl: string;
  token?: string;
};

export function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" shapeRendering="crispEdges" aria-hidden="true">
      <rect x="5" y="5" width="9" height="9" />
      <path d="M5 11H2V2h9v3" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" shapeRendering="crispEdges" aria-hidden="true">
      <path d="M3 8l4 4 6-7" />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" shapeRendering="crispEdges" aria-hidden="true">
      <path d="M1 5V2h4" />
      <path d="M15 5V2h-4" />
      <path d="M1 11v3h4" />
      <path d="M15 11v3h-4" />
      <line x1="1" y1="8" x2="15" y2="8" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="spinner">
      <path d="M8 2a6 6 0 1 1-6 6" />
    </svg>
  );
}

export function ShareActions({
  curlCommand,
  homeHref,
  shareUrl,
  token,
}: ShareActionsProps) {
  const [copied, setCopied] = useState<CopyTarget>(null);
  const [ocrState, setOcrState] = useState<OcrState>('idle');

  async function copyText(value: string, target: Exclude<CopyTarget, null>) {
    await navigator.clipboard.writeText(value);
    setCopied(target);

    window.setTimeout(() => {
      setCopied((current) => (current === target ? null : current));
    }, 1_500);
  }

  async function handleOcr() {
    if (!token || ocrState === 'loading') return;

    setOcrState('loading');

    try {
      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error ?? 'OCR failed');
      }

      const { text } = await res.json() as { text: string };
      await navigator.clipboard.writeText(text);
      setOcrState('done');
      setCopied('ocr');

      window.setTimeout(() => {
        setCopied((current) => (current === 'ocr' ? null : current));
        setOcrState('idle');
      }, 1_500);
    } catch {
      setOcrState('error');
      window.setTimeout(() => setOcrState('idle'), 2_000);
    }
  }

  return (
    <div className="share-actions">
      <button className="button" onClick={() => void copyText(`Screenshot: ${shareUrl}`, 'prompt')} type="button">
        {copied === 'prompt' ? <CheckIcon /> : <CopyIcon />} Prompt
      </button>

      {token ? (
        <button
          className="button button-secondary"
          disabled={ocrState === 'loading'}
          onClick={() => void handleOcr()}
          type="button"
        >
          {ocrState === 'loading' ? <SpinnerIcon /> : ocrState === 'done' ? <CheckIcon /> : <ScanIcon />} OCR
        </button>
      ) : null}

      <button
        className="button button-secondary"
        onClick={() => void copyText(curlCommand, 'curl')}
        type="button"
      >
        {copied === 'curl' ? <CheckIcon /> : <CopyIcon />} cURL
      </button>

      {homeHref ? (
        <Link className="button button-secondary" href={homeHref}>
          New paste
        </Link>
      ) : null}
    </div>
  );
}
