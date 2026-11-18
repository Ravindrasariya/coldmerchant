# Login reCAPTCHA setup

The login form uses Google reCAPTCHA v2's checkbox, following the supplied other-app guidelines. Existing passwords, sessions and account checks remain unchanged.

## Enable it

1. Register this app in the Google reCAPTCHA admin console at https://www.google.com/recaptcha/admin/create. Choose **reCAPTCHA v2 — I'm not a robot Checkbox**, not v3 or an Enterprise-only key.
2. Register the exact production hostname(s). Add the Replit preview hostname separately if you want the widget to work there. Do not include a scheme, port or path.
3. Set `RECAPTCHA_SITE_KEY` and `RECAPTCHA_SECRET_KEY` in the relevant server's private environment configuration. Do not commit a credentials file, paste the private key into chat or put the private key in a `VITE_` variable.
4. On Hostinger, configure both variables in the existing app environment and restart that app using its existing deployment process so PM2 inherits them. Replit Secrets do not automatically configure the VPS. No Node upgrade, schema change or new app build is required just to change these runtime keys.
5. Check that the checkbox appears, login is blocked without a valid challenge, a successful challenge permits normal password authentication, and a rejected password resets the checkbox.

## Intentional behavior

- With neither key configured, the widget is hidden and existing login continues normally. This is an optional rollout, not proof that CAPTCHA is enabled.
- The config endpoint `/api/recaptcha-config` exposes only the public site key and whether verification is required; never the private key.
- A site key shows the widget. Production enforcement requires the secret key. Configure both keys together.
- In `NODE_ENV=development`, server verification is deliberately skipped even when keys are present, matching the supplied guidelines. A configured site key still shows the widget and requires a client-side check.
- Outside development, a configured secret enables enforcement before password validation for **all** login accounts, including administrators. A secret without a site key returns a configuration error rather than bypassing verification.
- Failed verification, Google errors, malformed responses and the five-second verification timeout all deny the login attempt.
- Challenge expiry, widget errors and failed login attempts clear the client token. Failed login resets the widget because tokens cannot be reused.
- Failure to load the configuration blocks submission with a retry option rather than silently bypassing the challenge.
- English/Hindi CAPTCHA messages use the existing language preference. Other screens and password-change flows are not modified.
- Outbound HTTPS to Google's verification endpoint and browser access to Google's reCAPTCHA resources must be permitted.

## Verification

Run `npx tsx scripts/test-recaptcha.ts` for isolated server checks with synthetic tokens and a mocked Google verifier. No production database, real credentials or external verification calls are used.

Also run `npm run build` and check the login layout. Real Google acceptance and hostname registration must be tested after real keys are configured on the intended host; mocks cannot establish that a live key/domain pair works.
