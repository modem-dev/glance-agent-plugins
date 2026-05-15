import Link from 'next/link';

type BrandEyebrowProps = {
  href?: string;
};

function BrandIcon() {
  return (
    <svg className="eyebrow-icon" width="18" height="18" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#09090b" stroke="#3f3f46" strokeWidth="1.5" />
      <rect x="6" y="14" width="2" height="4" fill="#fafafa" />
      <rect x="8" y="12" width="2" height="2" fill="#fafafa" />
      <rect x="8" y="18" width="2" height="2" fill="#fafafa" />
      <rect x="10" y="10" width="4" height="2" fill="#fafafa" />
      <rect x="10" y="20" width="4" height="2" fill="#fafafa" />
      <rect x="18" y="10" width="4" height="2" fill="#fafafa" />
      <rect x="18" y="20" width="4" height="2" fill="#fafafa" />
      <rect x="22" y="12" width="2" height="2" fill="#fafafa" />
      <rect x="22" y="18" width="2" height="2" fill="#fafafa" />
      <rect x="24" y="14" width="2" height="4" fill="#fafafa" />
      <rect x="14" y="10" width="4" height="2" fill="#22c55e" />
      <rect x="12" y="12" width="2" height="2" fill="#22c55e" />
      <rect x="18" y="12" width="2" height="2" fill="#22c55e" />
      <rect x="12" y="18" width="2" height="2" fill="#22c55e" />
      <rect x="18" y="18" width="2" height="2" fill="#22c55e" />
      <rect x="14" y="20" width="4" height="2" fill="#22c55e" />
      <rect x="14" y="12" width="4" height="8" fill="#fafafa" />
      <rect x="12" y="14" width="2" height="4" fill="#fafafa" />
      <rect x="18" y="14" width="2" height="4" fill="#fafafa" />
      <rect x="14" y="14" width="4" height="4" fill="#09090b" />
    </svg>
  );
}

export function BrandEyebrow({ href }: BrandEyebrowProps) {
  const content = (
    <>
      <BrandIcon />
      glance.sh
    </>
  );

  if (href) {
    return (
      <Link href={href} className="eyebrow">
        {content}
      </Link>
    );
  }

  return <p className="eyebrow">{content}</p>;
}
