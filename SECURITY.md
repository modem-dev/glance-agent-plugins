# Security Policy

## Reporting vulnerabilities

Please report security issues privately to [support@modem.dev](mailto:support@modem.dev).
Do not open a public issue for suspected vulnerabilities.

Include as much detail as possible: affected route/plugin, reproduction steps,
impact, and whether you believe any user data or hosted-service secrets are at
risk.

## Deployment and secrets

The public repository must be safe for untrusted pull requests:

- no production secrets in the repo
- no `.env` files committed
- no public PR preview deployments with production Vercel env vars
- no hard-coded Sentry DSNs or telemetry endpoints that run by default

The hosted `glance.sh` deployment runs from a separate private deployment repo.

## Hosted service abuse reports

For content removal or abuse reports related to the hosted service, contact
[support@modem.dev](mailto:support@modem.dev).
