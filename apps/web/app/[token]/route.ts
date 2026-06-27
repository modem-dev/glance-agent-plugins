import { get } from '@vercel/blob';
import { NextResponse } from 'next/server';

import { decrypt } from '@/lib/encryption.server';
import {
  assetFilenameForToken,
  extensionForContentType,
  parseAssetSlug,
  parseToken,
  pathForToken,
} from '@/lib/tokens';

type AssetRouteContext = {
  params: Promise<{ token: string }>;
};

const SECURITY_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow, noarchive, noimageindex',
} as const;

export async function GET(
  _request: Request,
  { params }: AssetRouteContext,
): Promise<Response> {
  const { token: assetSlug } = await params;
  const parsedSlug = parseAssetSlug(assetSlug);

  if (!parsedSlug) {
    return new NextResponse('Not found', { status: 404 });
  }

  const parsed = parseToken(parsedSlug.token);

  if (parsed?.expired) {
    return new NextResponse('Expired', {
      status: 410,
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'X-Robots-Tag': 'noindex, nofollow, noarchive, noimageindex',
      },
    });
  }

  const blob = await get(pathForToken(parsedSlug.token), {
    access: 'private',
  });

  if (!blob) {
    return new NextResponse('Not found', { status: 404 });
  }

  // Buffer the encrypted blob and decrypt it.
  let contentType: string;
  let data: ArrayBuffer;

  try {
    const response = new Response(blob.stream);
    const encrypted = await response.arrayBuffer();
    const result = await decrypt(encrypted, parsedSlug.token);
    contentType = result.contentType;
    data = result.data;
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }

  const extension = extensionForContentType(contentType);
  const filename = assetFilenameForToken(parsedSlug.token, extension);

  return new NextResponse(data, {
    headers: {
      ...SECURITY_HEADERS,
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Type': contentType,
    },
  });
}
