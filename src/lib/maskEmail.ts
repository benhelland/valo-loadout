// Masks an email for on-screen display (/account) - not a security boundary
// (the real address is still in the session/DB), just keeps it off screen
// for things like screen-shares or screenshots. Local part is reduced to a
// fixed-length mask regardless of input length, rather than one asterisk per
// hidden character, so the mask itself doesn't leak how long the real local
// part is.
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email; // not a recognizable "local@domain" shape - show as-is rather than mangle it

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}
