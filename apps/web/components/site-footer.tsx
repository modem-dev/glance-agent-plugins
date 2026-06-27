import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-copy">
        <nav className="footer-nav" aria-label="Footer">
          <Link href="/docs" className="footer-link">
            Plugins
          </Link>
          <span className="footer-sep" aria-hidden="true">
            •
          </span>
          <Link href="/security" className="footer-link">
            Security
          </Link>
          <span className="footer-sep" aria-hidden="true">
            •
          </span>
          <Link href="/terms" className="footer-link">
            Terms
          </Link>
        </nav>

        <p className="footer-note">
          Brought to you by{' '}
          <a href="https://modem.dev" className="footer-link" target="_blank" rel="noreferrer">
            Modem
          </a>
          , your auto-triage PM
        </p>
      </div>

      <div className="footer-icons">
        <a
          href="https://x.com/modemdev"
          className="footer-link footer-icon"
          target="_blank"
          rel="noreferrer"
          aria-label="Modem on X"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </a>
        <a
          href="https://modem.dev"
          className="footer-link footer-icon"
          target="_blank"
          rel="noreferrer"
          aria-label="Modem"
        >
          <svg width="16" height="16" viewBox="0 0 400 400" fill="currentColor" aria-hidden="true">
            <path d="M394.444 0C397.513 0 400 2.48742 400 5.55566V394.444C400 397.513 397.513 400 394.444 400H5.55566C2.48742 400 0 397.513 0 394.444V5.55566C0 2.48742 2.48742 0 5.55566 0H394.444ZM168.593 100C167.436 100 166.499 100.936 166.499 102.091V131.358C166.499 132.513 165.562 133.449 164.405 133.449H135.093C133.937 133.449 132.999 134.385 132.999 135.539V164.111C132.999 165.266 132.062 166.202 130.905 166.202H68.0938C66.9374 166.202 66 167.138 66 168.293V297.909C66 299.064 66.9374 300 68.0938 300H114.156C115.313 300 116.25 299.064 116.25 297.909V243.554C116.25 242.399 117.188 241.464 118.344 241.464H130.906C132.062 241.464 133 242.399 133 243.554V297.909C133 299.064 133.937 300 135.094 300H151.844C153 300 153.938 299.064 153.938 297.909V260.278C153.938 259.124 154.875 258.188 156.031 258.188H168.594C169.75 258.189 170.687 259.124 170.688 260.278V297.909C170.688 299.064 171.625 300 172.781 300H189.532C190.689 300 191.626 299.064 191.626 297.909V277.004C191.626 275.849 192.563 274.913 193.72 274.913H206.282C207.439 274.913 208.376 275.849 208.376 277.004V297.909C208.376 299.064 209.313 300 210.47 300H227.219C228.375 300 229.312 299.064 229.312 297.909V260.278C229.313 259.124 230.25 258.188 231.406 258.188H243.969C245.125 258.189 246.062 259.124 246.062 260.278V297.909C246.062 299.064 247 300 248.156 300H264.905C266.062 300 266.999 299.064 266.999 297.909V243.554C266.999 242.399 267.937 241.464 269.093 241.464H281.655C282.812 241.464 283.749 242.399 283.749 243.554V297.909C283.749 299.064 284.687 300 285.843 300H331.906C333.063 300 334 299.064 334 297.909V168.293C334 167.138 333.063 166.202 331.906 166.202H269.093C267.937 166.202 266.999 165.266 266.999 164.111V135.539C266.999 134.385 266.062 133.449 264.905 133.449H235.594C234.437 133.449 233.5 132.513 233.5 131.358V102.091C233.5 100.936 232.562 100 231.406 100H168.593Z" />
          </svg>
        </a>
      </div>
    </footer>
  );
}
