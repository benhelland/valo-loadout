# Risks and mitigations

This project made a deliberate, informed choice to build store notifications on Riot's unofficial endpoints rather than skip the feature. This doc exists so that choice stays informed as the project grows.

## Riot ToS / account risk

**The risk:** Riot's official developer policy states plainly that store/shop tracking is not a supported use case of their public API — "the technology for this does not currently exist in the API." Every tool that does this (SkinPeek and its forks, various Discord bots) works by authenticating as the user and calling the same undocumented endpoints the game client uses, not Riot's sanctioned partner API. That's a gray area: widely tolerated in practice, with no evidence of a ban wave against users of these tools, but not officially sanctioned, and it can change without notice. The most established project in this space went dark in 2025, which is a signal worth taking seriously even without a confirmed cause.

**What this means for this codebase:**

- The store-check subsystem is architected as an isolated module specifically so it can be disabled without breaking the gallery, loadout builder, or wishlist. If this feature ever needs to be pulled — Riot locks it down, the endpoints change, or the risk calculus shifts — the rest of the app survives that.
- Users linking a Riot account need genuine, plain-language disclosure first: what's accessed (shop contents only, read-only), how credentials are handled, and that this uses an unofficial method Riot hasn't sanctioned. Not buried in a ToS wall.
- Poll conservatively. The behavior most likely to draw attention is aggressive or synchronized polling across many accounts, not the existence of the integration.
- Don't build anything that writes to or modifies an account — no equipping skins, no spending VP. Read-only meaningfully lowers both the technical and reputational risk.

**CAPTCHA is the default path, not an edge case.** `PUT /api/v1/authorization` takes an hCaptcha token as a *required* field, so password login is CAPTCHA-gated for everyone, always. This project therefore never built a password flow at all; account linking uses Riot's OAuth authorization-code flow, where the user signs in on Riot's own page and our servers never receive a password. Two consequences worth keeping in view:

- **The "never store a raw password" rule got easier to honour, not harder.** There is no password to mishandle. The stored secret is an OAuth refresh token, encrypted at rest, deletable by the user at any time from `/account`.
- **A second wall sits behind the CAPTCHA one: Cloudflare, which is hardest on datacenter IPs.** The known mitigations in this space are proxy rotation and residential hosting. **Proxy rotation is bot-detection evasion and is deliberately not implemented** — it's precisely the behavior this document warns draws attention. Running the poller from a machine that isn't blocked in the first place is a different thing and is supported (`npm run check-shops`). If the only way to keep this feature working ever becomes active evasion, that's the signal to drop the feature, not to escalate. The isolation of the store-check module exists so that stays a cheap decision.

Where Riot's endpoint returns a hard block, surface it as an honest status (`captcha_blocked`) rather than retrying — retrying into a CAPTCHA wall is exactly the aggressive pattern described above.

## Credential handling

- Never persist a user's raw Riot password. (Moot in practice — the OAuth flow means we never receive one.)
- Encrypt tokens at rest; scope database access to the store-check subsystem only.
- Provide a clean path for a user to unlink and have their token deleted.

### What a database breach would expose

- **The Riot refresh token is the one that matters.** `linked_riot_accounts.encryptedRefreshToken` is AES-256-GCM ciphertext, inert without `RIOT_TOKEN_ENCRYPTION_KEY`, which lives only in environment variables and never in the database. But Riot's OAuth client (`riot-client`) is a **public client with no secret at all** — if the ciphertext and the key are ever exposed together, the refresh grant needs nothing else to produce a live Riot session. The full ceiling of what that session can do, beyond the endpoints this app chooses to call, is not something this project has verified. Treat a combined database + key exposure as a live account compromise, not a contained one.
- **Discord OAuth tokens are not stored.** NextAuth's default schema keeps `refresh_token`/`access_token`/`id_token`/`session_state` as plain columns. Nothing in this app ever reads them back, so `src/lib/authAdapter.ts` strips those four fields before the row is written rather than encrypting values nothing uses. `type`/`provider`/`providerAccountId`/`scope`/`expires_at`/`token_type` are kept — none is a credential, and `scope` is useful for support.
  - Even stored, a Discord refresh token alone would be inert: Discord's token endpoint requires `client_secret` for the refresh grant, so a database-only breach couldn't use it. That asymmetry is what makes the Riot token the one to actually worry about.
- **The runtime database connection is least-privilege.** `DATABASE_URL` — what the running app uses — is a dedicated role with SELECT/INSERT/UPDATE/DELETE only, no CREATE/ALTER/DROP, set up via `src/scripts/setupAppRole.ts`. `DIRECT_URL`, used only by the Prisma CLI for migrations, stays on the owner role. A leaked `DATABASE_URL` can't be used to drop or alter the schema, only to read and write rows the app could already touch.
- **`RIOT_TOKEN_ENCRYPTION_KEY` has a real rotation path.** `src/scripts/rotateEncryptionKey.ts` decrypts every linked account under the old key and re-encrypts under a new one in place — `encryptSecret`/`decryptSecret` default to the cached env key but accept an explicit override, which is what lets both keys be alive in one process. A row that fails to decrypt under the old key is left untouched rather than corrupted, and reported by the script; it needs a manual re-link.

## Dependency risk (valorant-api.com)

A free, unofficial, community-run service — not a Riot product, not a paid SLA. It could go down, change its schema, or shut down.

- Cache what's needed rather than depending on live calls per request.
- Keep the sync job tolerant of schema drift; don't hard-fail the whole app if one field disappears.
- If it becomes unavailable long-term, the fallback is Riot's public developer API for what it does cover plus manually-sourced skin data — a real cost, but not project-ending, because the gallery is decoupled from the account and notification pieces.

## Dependency vulnerabilities

`npm audit` findings are handled per-chain rather than by running `npm audit fix --force`, which in this project's case would downgrade Prisma a full major version — a regression, not a fix.

- **Patched via npm `overrides`**: `mysql2` and `deepmerge-ts`, both pulled in only by Prisma's CLI tooling. This app is Postgres-only via `@prisma/adapter-neon` and never opens a MySQL connection, so the vulnerable paths were unreachable regardless; the overrides are same-major and verified against the full type-check/lint/build/test suite.
- **Accepted, not patched**: `file-type`, pulled in by `node-vibrant`'s internal legacy `@jimp` chain, used by the sync job's color extraction. Every patched release is ESM-only while the legacy `@jimp/core` `require()`s it expecting a CJS named export — forcing the patched version installs cleanly but breaks at runtime. The only route `npm audit` offers is downgrading `node-vibrant` a major version, which needs its own test pass rather than a one-line fix. The vulnerable path (an infinite loop parsing malformed ASF container data) is unreachable here: this pipeline only ever processes known-good PNG/JPEG renders from valorant-api.com's CDN at sync time, never untrusted input. Revisit if `node-vibrant` ships a modern `jimp`/`file-type`, or if color extraction moves onto the `jimp` version this project already uses elsewhere.

## 3D weapon viewer (considered, declined)

A drag/rotate 3D inspect view was proposed and explicitly declined as a near-term goal. No legitimate data source, including valorant-api.com, exposes 3D models; the only way to get them is extracting assets from the game client, which means redistributing Riot's copyrighted 3D and texture assets to every site visitor. That's a materially larger and different kind of risk than the store-notification tradeoff above, which reuses endpoints via a user's own authenticated session rather than extracting and hosting Riot's assets. If revisited, treat it as a fresh decision requiring the same explicit-tradeoff treatment, not a default yes.

## Legal / branding

- Not affiliated with or endorsed by Riot Games. Say so visibly in the UI.
- Don't use Riot/VALORANT branding in a way that implies official status.
- Don't monetize in a way that trades on Riot's IP beyond what's already common in this fan-tool space.
