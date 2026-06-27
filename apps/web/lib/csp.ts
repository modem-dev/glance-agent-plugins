type BuildCspOptions = {
  isDev: boolean;
};

export function buildContentSecurityPolicy(options: BuildCspOptions): string {
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    'https://va.vercel-scripts.com',
  ];

  // Keep unsafe-eval in development only for tooling/HMR compatibility.
  if (options.isDev) {
    scriptSrc.splice(2, 0, "'unsafe-eval'");
  }

  return [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://vercel.com https://*.public.blob.vercel-storage.com https://*.sentry.io https://*.ingest.us.sentry.io https://*.vercel-insights.com https://va.vercel-scripts.com",
    "frame-ancestors 'none'",
  ].join('; ');
}
