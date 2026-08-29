// The buddy gallery's "pick a buddy" mode carries a `returnTo` path in the
// URL so it knows where to send the user back to with their choice. That
// value is attacker-controllable, so it's validated here rather than
// trusted: only same-origin, relative, single-slash paths are allowed.
//
// Rejects, specifically:
//   - absolute URLs ("https://evil.example") - open redirect
//   - protocol-relative URLs ("//evil.example") - same, via a subtler form
//   - anything not starting with "/" - not a path we'd ever have produced
export function safeReturnTo(raw: string | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  // Backslashes get normalised to forward slashes by some browsers, so
  // "/\evil.example" can behave like a protocol-relative URL.
  if (raw.startsWith("/\\")) return null;
  return raw;
}

// Appends/overwrites a query param on an already-validated relative path.
export function withParam(path: string, key: string, value: string): string {
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set(key, value);
  return `${pathname}?${params.toString()}`;
}
