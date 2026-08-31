import { RiotError } from "@/riot/errors";

/**
 * The `ssid` value is user-pasted and gets sent as an HTTP `Cookie` header, so
 * it is validated before it can reach a request or the database. A value
 * containing CR/LF would be classic header injection; RFC 6265 also forbids
 * control characters, whitespace, quotes, commas and semicolons in a cookie
 * value, so anything containing them isn't a cookie we should be handling.
 *
 * The allowed set below is RFC 6265's `cookie-octet`: %x21, %x23-2B, %x2D-3A,
 * %x3C-5B, %x5D-7E - i.e. printable ASCII minus space, `"`, `,`, `;` and `\`.
 */
const COOKIE_OCTET = /^[\x21\x23-\x2B\x2D-\x3A\x3C-\x5B\x5D-\x7E]+$/;

const MIN_LENGTH = 20;
const MAX_LENGTH = 4096;

export function assertUsableSsid(value: string): void {
  if (value.length < MIN_LENGTH || value.length > MAX_LENGTH) {
    throw new RiotError("UNEXPECTED", "That doesn't look like an ssid cookie value. Copy the whole value, nothing else.");
  }
  if (!COOKIE_OCTET.test(value)) {
    throw new RiotError(
      "UNEXPECTED",
      "That value contains characters a cookie can't contain. Copy only the ssid value - not the whole header, and no quotes.",
    );
  }
}
