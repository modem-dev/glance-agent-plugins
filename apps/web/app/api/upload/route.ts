import { type HandleUploadBody, handleUpload } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

import {
  ALLOWED_IMAGE_TYPES,
  MAX_ALLOWED_EXPIRY_AHEAD_MS,
  MAX_UPLOAD_BYTES,
  UPLOAD_TOKEN_TTL_MS,
} from '@/lib/config';
import { parseToken, tokenFromPathname } from '@/lib/tokens';
import { verifyUploadProof } from '@/lib/upload-proof';

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const token = tokenFromPathname(pathname);
        if (!token) {
          throw new Error('Invalid upload pathname.');
        }

        const parsed = parseToken(token)!;

        if (parsed.expired) {
          throw new Error('Upload token has already expired.');
        }

        if (parsed.expiresAt > Date.now() + MAX_ALLOWED_EXPIRY_AHEAD_MS) {
          throw new Error('Upload token exceeds the allowed lifetime.');
        }

        const proofCheck = verifyUploadProof(clientPayload, {
          token,
          pathname,
          tokenExpiresAt: parsed.expiresAt,
        });

        if (!proofCheck.ok) {
          throw new Error(proofCheck.error);
        }

        return {
          addRandomSuffix: false,
          allowedContentTypes: [...ALLOWED_IMAGE_TYPES, 'application/octet-stream'],
          allowOverwrite: false,
          cacheControlMaxAge: 60,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          validUntil: Date.now() + UPLOAD_TOKEN_TTL_MS,
        };
      },
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(response);
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : 'Could not upload image.';

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
