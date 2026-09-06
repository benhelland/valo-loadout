// Maintenance mode: a global off switch that answers every request from the
// proxy (middleware) layer, before any route renders.
//
// The point is that it runs *before* the database. Nothing here imports
// Prisma, touches a connection, or renders a Server Component, so a site in
// maintenance mode costs no database compute at all - which is the whole
// reason it exists. Anything that gated inside a page or layout would already
// have woken the database to get there.
//
// Deliberately self-contained HTML with inline styles and no assets: the
// response must not depend on /_next/* being served, so the switch can block
// literally every path without leaving a half-styled page behind.

/** Enabled when MAINTENANCE_MODE is exactly "1" - anything else is off. */
export function isMaintenanceEnabled(): boolean {
  return process.env.MAINTENANCE_MODE === "1";
}

/**
 * Lets the operator through while everyone else sees the notice. Without this
 * the switch is blinding: there would be no way to confirm the site actually
 * works before turning it back on for real users.
 *
 * Visiting any URL with `?maintenance-bypass=<secret>` sets a cookie, so it
 * only has to be done once per browser. Fails closed - no secret configured
 * means no bypass, never "allow".
 */
export const BYPASS_COOKIE = "maintenance-bypass";
export const BYPASS_PARAM = "maintenance-bypass";

export function bypassSecret(): string | null {
  const secret = process.env.MAINTENANCE_BYPASS_SECRET;
  return secret && secret.length > 0 ? secret : null;
}

/**
 * Constant-time-ish comparison. Not security-critical - the worst a forged
 * bypass gets you is a working website - but there is no reason to leak the
 * secret's length or prefix through timing either, and Web Crypto's timing-safe
 * helpers are not available in this runtime.
 */
export function isValidBypass(candidate: string | undefined, secret: string): boolean {
  if (!candidate || candidate.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i += 1) {
    diff |= candidate.charCodeAt(i) ^ secret.charCodeAt(i);
  }
  return diff === 0;
}

// 503 rather than 200, with Retry-After. A 200 would tell search engines the
// maintenance notice *is* the page and let it be indexed in place of the real
// content; a 503 with Retry-After is the documented "temporarily down, come
// back later" signal and keeps existing rankings intact. Do not add noindex
// here - that would actively remove pages rather than pause them.
export const MAINTENANCE_STATUS = 503;
export const MAINTENANCE_RETRY_AFTER_SECONDS = 3600;

export function maintenanceHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Valoadout - Maintenance</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #0f1923; color: #ece8e1; padding: 24px;
    font-family: "Rajdhani", "DIN Next", system-ui, -apple-system, Segoe UI, Arial, sans-serif;
  }
  main {
    max-width: 520px; width: 100%; background: #1a2632; border: 1px solid #2c3a49;
    border-top: 3px solid #ff4655; padding: 40px 32px;
    clip-path: polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px);
  }
  h1 {
    margin: 0 0 16px; font-size: 34px; line-height: 1.05; letter-spacing: 0.04em;
    text-transform: uppercase; font-weight: 700;
  }
  p { margin: 0 0 12px; color: #8a97a8; font-size: 16px; line-height: 1.55; }
  .tag {
    display: inline-block; margin-bottom: 20px; padding: 4px 10px; background: #ff4655;
    color: #2b0409; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
  }
  footer { margin-top: 28px; border-top: 1px solid #2c3a49; padding-top: 16px; font-size: 12px; color: #8a97a8; }
</style>
</head>
<body>
  <main>
    <span class="tag">Maintenance</span>
    <h1>Back shortly</h1>
    <p>Valoadout is temporarily offline for scheduled maintenance. Your loadouts, wishlist and linked accounts are untouched.</p>
    <p>Try again in a little while.</p>
    <footer>
      Valoadout is not affiliated with or endorsed by Riot Games, Inc.
    </footer>
  </main>
</body>
</html>`;
}
