'use client';

import { useState } from 'react';

import { CheckIcon, CopyIcon } from '@/components/share-actions';

type DocsCopyBlockProps = {
  code: string;
  copyLabel?: string;
};

export function DocsCopyBlock({ code, copyLabel = 'Copy snippet' }: DocsCopyBlockProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(code);
    setCopied(true);

    window.setTimeout(() => {
      setCopied(false);
    }, 1_500);
  }

  return (
    <div className="docs-command-wrap">
      <pre className="share-command docs-command-block">{code}</pre>
      <button
        type="button"
        className="docs-command-copy"
        onClick={() => void handleCopy()}
        aria-label={copyLabel}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </div>
  );
}
