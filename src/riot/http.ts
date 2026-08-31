import { RiotError } from "@/riot/errors";

// The ONLY place this app makes outbound calls to Riot. Everything that talks
// to Riot goes through riotFetch() so the rate limiting, block detection, and
// redaction below can't be bypassed by a new call site forgetting about them.
//
// Deliberately NOT implemented here, and not to be added later without
// revisiting docs/RISKS.md: proxy rotation, TLS-fingerprint spoofing, or
// CAPTCHA solving. SkinPeek (the reference implementation this project cites)
// shipped a proxy manager to route around Cloudflare blocks; that is
// bot-detection evasion, and RISKS.md is explicit that this kind of behaviour
// is exactly what draws attention. When Riot blocks us we surface it as a
// status and stop - see RiotError "BLOCKED".

const AUTH_ORIGIN = "https://auth.riotgames.com";

// A single request identifies itself as the Riot client, because that is
// inherent to the approach this project already accepted in docs/RISKS.md
// (authenticate as the user, call the endpoints the client calls). This is
// not an additional evasion measure - it's speaking the protocol the endpoint
// expects. The line stays at: no IP rotation, no CAPTCHA solving.
const USER_AGENT = "RiotClient/63.0.9.4909983.4789131 rso-auth (Windows;10;;Professional, x64)";

// --- Rate limiting -------------------------------------------------------
//
// CLAUDE.md: "Rate-limit anything that talks to Riot's servers... aggressive
// polling is the kind of behavior that gets unofficial integrations noticed."
//
// Two independent guards, because they stop different failure modes:
//  1. MIN_INTERVAL_MS serialises outbound calls so a burst can never leave
//     here faster than one every 250ms, no matter how many callers pile in.
//  2. MAX_CALLS_PER_PROCESS is a circuit breaker for the runaway-loop case -
//     a bug that retries forever trips it instead of hammering Riot.
//
// Honest limitation: both are per-process. On serverless each cold start gets
// a fresh budget, so these cannot enforce a global fleet-wide rate. The real
// cadence control is `linked_riot_accounts.nextPollAt` in the database (one
// poll per account per day); this is the belt to that pair of braces.
const MIN_INTERVAL_MS = 250;
const MAX_CALLS_PER_PROCESS = 500;
const REQUEST_TIMEOUT_MS = 15_000;

let callCount = 0;
let queueTail: Promise<void> = Promise.resolve();
let lastCallAt = 0;

function throttle<T>(fn: () => Promise<T>): Promise<T> {
  const run = queueTail.then(async () => {
    const waitFor = lastCallAt + MIN_INTERVAL_MS - Date.now();
    if (waitFor > 0) await new Promise((resolve) => setTimeout(resolve, waitFor));
    lastCallAt = Date.now();
  });
  // Keep the chain alive even if a call rejects, or one failure would wedge
  // the queue for every later caller.
  queueTail = run.catch(() => {});
  return run.then(fn);
}

// --- Redaction -----------------------------------------------------------

// Riot's reauth redirect carries the access token in the URL *fragment*
// (…/opt_in#access_token=…&id_token=…). Logging a raw URL from this
// subsystem would therefore write live credentials to the log, which
// CLAUDE.md forbids outright ("Never log raw credentials or tokens,
// including in error reporting"). Everything loggable goes through here.
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "<unparseable url>";
  }
}

// --- Fetch ---------------------------------------------------------------

export interface RiotFetchOptions {
  method?: "GET" | "POST" | "PUT";
  headers?: Record<string, string>;
  /** Serialised as JSON. Mutually exclusive with `rawBody`. */
  body?: unknown;
  /**
   * Pre-encoded body, sent verbatim. Riot's OAuth token endpoint requires
   * `application/x-www-form-urlencoded`, not JSON - passing a URLSearchParams
   * string through `body` would have JSON-quoted it into garbage.
   */
  rawBody?: string;
  cookie?: string;
  // Some flows need the 3xx itself rather than the followed redirect.
  redirect?: "follow" | "manual";
}

export async function riotFetch(url: string, options: RiotFetchOptions = {}): Promise<Response> {
  if (callCount >= MAX_CALLS_PER_PROCESS) {
    throw new RiotError("UNAVAILABLE", "Outbound request budget exhausted - refusing to call Riot again this run");
  }
  callCount++;

  return throttle(async () => {
    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      ...options.headers,
    };
    // Only default the content type for JSON bodies - a rawBody caller sets
    // its own (and would break if this stomped it).
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (options.cookie) headers["Cookie"] = options.cookie;

    const body =
      options.rawBody !== undefined ? options.rawBody : options.body === undefined ? undefined : JSON.stringify(options.body);

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method ?? "GET",
        headers,
        body,
        redirect: options.redirect ?? "follow",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      // Network-level failure or timeout. The message is ours, not the
      // underlying error's, so nothing from the request can leak into it.
      const reason = err instanceof Error && err.name === "TimeoutError" ? "timed out" : "network error";
      throw new RiotError("UNAVAILABLE", `Could not reach Riot (${reason})`);
    }

    assertNotBlocked(response, url);
    return response;
  });
}

// Cloudflare / bot-wall detection. The 403 + SAMEORIGIN signature is the one
// SkinPeek used and it's still the clearest tell; a 429 is Riot rate-limiting
// us directly, which we treat the same way - stop, don't retry into it.
function assertNotBlocked(response: Response, url: string): void {
  if (response.status === 403 && response.headers.get("x-frame-options") === "SAMEORIGIN") {
    throw new RiotError(
      "BLOCKED",
      "Riot's bot protection blocked this request. This usually means the server's IP is flagged - it is not something you can fix by retrying.",
    );
  }
  if (response.status === 429) {
    throw new RiotError("BLOCKED", "Riot rate-limited this request. Waiting for the next scheduled check rather than retrying.");
  }
  if (response.status >= 500) {
    throw new RiotError("UNAVAILABLE", `Riot returned a server error (${response.status}) for ${redactUrl(url)}`);
  }
}

export { AUTH_ORIGIN };
