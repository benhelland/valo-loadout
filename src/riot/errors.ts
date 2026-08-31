import { LinkedAccountStatus } from "@/generated/prisma/client";

// Every failure mode this subsystem can hit, mapped to a status the user can
// actually act on. docs/RISKS.md is explicit that a CAPTCHA/hard block is "an
// honest status surfaced to the user, not something to work around with
// retries" - keeping the kinds distinct is what makes that possible instead
// of collapsing everything into a generic "error".
export type RiotFailureKind =
  // The stored session cookie no longer works. Riot bounced us to the login
  // page. Only fix is the user re-linking - never retry-loop this.
  | "EXPIRED"
  // Cloudflare / bot-detection wall. Also not retryable, and deliberately NOT
  // worked around (no proxy rotation, no CAPTCHA solving) - see the note in
  // http.ts.
  | "BLOCKED"
  // Riot-side hiccup or network failure. Genuinely transient; a bounded retry
  // later is reasonable.
  | "UNAVAILABLE"
  // A response we didn't recognise - most likely Riot changed something.
  // Treated as non-retryable so it surfaces loudly rather than hammering.
  | "UNEXPECTED";

export class RiotError extends Error {
  readonly kind: RiotFailureKind;

  constructor(kind: RiotFailureKind, message: string) {
    // Callers put these straight into `linked_riot_accounts.lastError`, which
    // is rendered on /account. Messages must therefore stay short, plain, and
    // free of anything derived from a token or cookie.
    super(message);
    this.kind = kind;
    this.name = "RiotError";
  }

  get accountStatus(): LinkedAccountStatus {
    switch (this.kind) {
      case "EXPIRED":
        return LinkedAccountStatus.EXPIRED;
      case "BLOCKED":
        return LinkedAccountStatus.CAPTCHA_BLOCKED;
      case "UNAVAILABLE":
      case "UNEXPECTED":
        return LinkedAccountStatus.ERROR;
    }
  }

  // Whether it's ever sensible to try again later without user action.
  get isRetryable(): boolean {
    return this.kind === "UNAVAILABLE";
  }
}

export function isRiotError(err: unknown): err is RiotError {
  return err instanceof RiotError;
}
