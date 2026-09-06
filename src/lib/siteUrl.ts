// The site's public origin, for absolute URLs in robots.txt and sitemap.xml.
//
// NEXT_PUBLIC_APP_URL is the real domain in production. VERCEL_URL is the
// per-deployment host, which is what preview builds have. Falling back to
// localhost keeps `next build` working with neither set.
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
