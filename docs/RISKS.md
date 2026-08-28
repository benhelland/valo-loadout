# Risks and mitigations

This project made a deliberate, informed choice to build store notifications on Riot's unofficial/internal endpoints rather than skip the feature. This doc exists so that choice stays informed as the project grows, and so future sessions don't quietly relitigate it without reading why it was made this way.

## Riot ToS / account risk

**The risk:** Riot's official developer policy states plainly that store/shop tracking is not a supported use case of their public API ("the technology for this does not currently exist in the API"). Every existing tool that does this (SkinPeek and its forks, various Discord bots) works by authenticating as the user and calling the same undocumented endpoints the game client itself uses — not Riot's sanctioned partner API. That's a gray area: widely tolerated in practice (no evidence of a ban wave against users of these tools), but not officially sanctioned, and it can change without notice. The most established project in this space (SkinPeek) went dark in 2025 rather than a smaller one, which is a signal worth taking seriously even without a confirmed cause.

**What this means for this codebase:**

- The store-check subsystem is architected as an isolated module specifically so it can be disabled without breaking the gallery, loadout builder, or wishlist (`ARCHITECTURE.md`). If this feature ever needs to be pulled — because Riot locks it down, because the underlying endpoints change, or because the risk calculus changes — the rest of the app should survive that.
- Users linking a Riot account need genuine, plain-language disclosure before they do it: what's being accessed (shop contents only, read-only), how credentials are handled (never stored — see below), and that this uses an unofficial method Riot hasn't sanctioned. Don't bury this in a ToS wall of text.
- Poll conservatively (see `ARCHITECTURE.md` cadence notes). The behavior most likely to draw attention is aggressive/synchronized polling across many accounts, not the existence of the integration itself.
- Don't build anything that writes to or modifies an account (equip skins, spend VP) — this project reads shop state only. Read-only meaningfully lowers both the technical and reputational risk.

**Known limitation, not a bug to "fix":** Riot's auth endpoint can return a CAPTCHA challenge on some accounts or after repeated attempts, which this unofficial flow cannot solve. Some accounts simply won't be linkable this way, sometimes intermittently. Handle this as an honest status (`captcha_blocked`) surfaced to the user, not something to work around with retries — retrying into a CAPTCHA wall is exactly the aggressive-polling pattern that risks drawing attention (see above).

## Credential handling risk

- Never persist a user's raw Riot password. Use it only transiently during the auth handshake to obtain a session token/cookie, then discard it.
- Encrypt session tokens at rest; scope database/service access to the store-check subsystem only.
- Have a clean path for a user to unlink their account and have their token deleted.

## Dependency risk (valorant-api.com)

This is a free, unofficial, community-run service — not a Riot product, not a paid SLA. It could go down, change its schema, or shut down.

- Cache/mirror what's needed rather than depending on live calls for every request.
- Keep the sync job tolerant of schema drift (don't hard-fail the whole app if one field goes missing).
- If it becomes unavailable long-term, the fallback is Riot's actual public developer API for whatever it does cover (agents, maps, etc.) plus manually-sourced skin data — a real cost, but not a project-ending one, because the gallery is decoupled from the account/notification pieces.

## 3D weapon viewer (considered, declined)

A drag/rotate 3D inspect view (like the in-game inspect) was proposed and explicitly declined as a v1 or near-term goal. No legitimate data source — including valorant-api.com — exposes 3D models; the only way to get them is extracting/ripping assets from the game client, which means redistributing Riot's actual copyrighted 3D/texture assets to every site visitor. That's a materially larger and different kind of risk than the store-notification tradeoff above (which reuses endpoints via a user's own authenticated session rather than extracting and hosting Riot's assets ourselves). If this gets revisited, treat it as a fresh decision requiring the same explicit-tradeoff treatment as store notifications got, not a default yes. See `PRD.md` out-of-scope list.

## Legal / branding

- Not affiliated with or endorsed by Riot Games. Say so visibly in the UI once there is one.
- Don't use Riot/VALORANT branding in a way that implies official status (app name, logo treatment).
- Don't monetize in a way that trades on Riot's IP beyond what's already common in this fan-tool space (ads/donations are the norm among comparable tools; anything beyond that deserves a second look).
