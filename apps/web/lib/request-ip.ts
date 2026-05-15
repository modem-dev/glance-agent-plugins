function firstHeaderValue(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const first = value.split(',')[0]?.trim();
  return first || null;
}

export function getRequestIp(request: Request): string {
  return (
    firstHeaderValue(request.headers.get('x-forwarded-for')) ??
    firstHeaderValue(request.headers.get('x-real-ip')) ??
    'unknown'
  );
}
