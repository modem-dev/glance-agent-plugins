import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const socialImageSize = { width: 1200, height: 630 };

type SocialImageOptions = {
  section?: string;
  title: string;
  description: string;
};

let boldFontPromise: Promise<Buffer> | null = null;

async function getBoldFont() {
  if (!boldFontPromise) {
    boldFontPromise = readFile(join(process.cwd(), 'app/JetBrainsMono-Bold.ttf'));
  }

  return boldFontPromise;
}

export async function renderSocialImage({ section, title, description }: SocialImageOptions) {
  const font = await getBoldFont();
  const eyebrow = section ? `${section} · glance.sh` : 'glance.sh';

  return new ImageResponse(
    (
      <div
        style={{
          alignItems: 'flex-start',
          background: '#09090b',
          display: 'flex',
          flexDirection: 'column',
          fontFamily: '"JetBrains Mono"',
          height: '100%',
          justifyContent: 'center',
          padding: '80px 100px',
          width: '100%',
        }}
      >
        <div
          style={{
            color: '#71717a',
            fontSize: 22,
            letterSpacing: '0.12em',
            marginBottom: 32,
            textTransform: 'uppercase',
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            color: '#fafafa',
            fontSize: 58,
            fontWeight: 700,
            lineHeight: 1.15,
            marginBottom: 28,
            maxWidth: '95%',
          }}
        >
          {title}
        </div>
        <div
          style={{
            color: '#71717a',
            fontSize: 26,
            lineHeight: 1.35,
            maxWidth: '95%',
          }}
        >
          {description}
        </div>
      </div>
    ),
    {
      ...socialImageSize,
      fonts: [
        {
          name: 'JetBrains Mono',
          data: font,
          style: 'normal',
          weight: 700,
        },
      ],
    },
  );
}
