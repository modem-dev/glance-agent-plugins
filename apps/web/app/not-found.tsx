import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="not-found">
      <section className="panel">
        <p className="eyebrow">404</p>
        <h1 className="headline">Not here.</h1>
        <p className="lede">Bad token, missing upload, or already cleaned up.</p>
        <div style={{ marginTop: 24 }}>
          <Link className="button" href="/">
            New paste
          </Link>
        </div>
      </section>
    </main>
  );
}
