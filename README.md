# Valoadout

A webapp for VALORANT cosmetics: build your ideal loadout across every weapon, wishlist the skins you want, browse every skin and animation ever released in a UI that actually shows them off, and get a Discord DM the moment something on your wishlist shows up in your daily store.

**Status:** live at [valo-loadout.vercel.app](https://valo-loadout.vercel.app). Feature-complete through Phase 3, with store notifications not yet wired to a Discord bot. See [`docs/ROADMAP.md`](./docs/ROADMAP.md) for what's done and what's left, and [`docs/LAUNCH_CHECKLIST.md`](./docs/LAUNCH_CHECKLIST.md) for the remaining deploy steps.

Not affiliated with or endorsed by Riot Games. VALORANT and all associated assets are property of Riot Games, Inc. Skin and cosmetic data courtesy of [valorant-api.com](https://valorant-api.com), an unofficial community project.

## What it does

**Gallery** — every skin for every weapon and knife, plus every buddy. Filter by weapon, rarity, collection, color, vibe and whether a skin has an animation; fuzzy search that tolerates typos and skipped letters; filters apply instantly and live entirely in the URL, so every view is a real shareable link. Skin pages show levels, chroma swatches, video playback where it exists, and a movable buddy badge.

**Color and vibe filters** — a dominant-color family is extracted from every skin and every chroma at sync time, and each skin is tagged with 1–4 vibes (dark, sleek, futuristic, tactical, cosmic, …) from a fixed vocabulary by a vision model, so you can browse by aesthetic rather than by metadata.

**Loadout builder** — a board with every weapon slot visible at once, grouped like the in-game buy menu. The picker is the gallery itself scoped to one weapon, so building a loadout is an extension of browsing rather than a separate form. Multiple named loadouts, duplicate/rename/delete, and a running VP total that reports how many items are estimated or unpriced instead of silently counting them as zero.

**Sharing** — loadouts are private by default; opting in mints an unguessable slug that serves a read-only page and can be revoked. Individual skin+level+chroma+buddy combos share as stateless links with no database row at all. Loadouts also export as an image to the clipboard.

**Wishlist and store notifications** — heart any skin from the gallery or its detail page. Link a Riot account, and when a wishlisted skin appears in your daily shop you get a single batched Discord DM. Linking goes through Riot's own OAuth sign-in page — the app never sees a password.

**Pricing** — no public source exposes VALORANT prices, so real VP costs are harvested from the storefront responses the shop check already fetches, at zero extra API calls. Everything else is either estimated from prices Riot has actually been observed to charge, shown as a range when observations legitimately disagree, or marked Unknown. A guess is never presented as a real price.

## Docs

- [`CLAUDE.md`](./CLAUDE.md) — project constraints, commands, and the decisions that shouldn't be relitigated
- [`docs/PRD.md`](./docs/PRD.md) — what this is, who it's for, feature scope
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — stack, data model, and how each subsystem works
- [`docs/RISKS.md`](./docs/RISKS.md) — the ToS and account-risk tradeoffs this project knowingly accepts, and the guardrails that follow
- [`docs/ROADMAP.md`](./docs/ROADMAP.md) — build phases and what's still ahead

## A word on how this works

Store notifications aren't possible through Riot's official, sanctioned API — by Riot's own admission, "the technology for this does not currently exist" there. This project reads a linked account's shop the way community tools have for years: the same internal endpoints the game client itself calls, authenticated via Riot's own OAuth sign-in page. That's a deliberate, accepted tradeoff, not an oversight — read [`docs/RISKS.md`](./docs/RISKS.md) before assuming this should "just use the real API."

## Setup

Nothing here works end-to-end without your own Neon Postgres project, Discord application, and (optionally) an Anthropic API key. See `.env.example` for the full list and `CLAUDE.md`'s "Local setup" section for what each one is for.

```bash
npm install
cp .env.example .env.local   # fill in a real Neon DATABASE_URL / DIRECT_URL, Discord app credentials, etc.
npx prisma generate
npx prisma migrate deploy    # apply the schema to your database
npm run sync                 # populate the skin/buddy catalog from valorant-api.com
npm run dev
```

**If you fork this to run your own instance, keep dev and production on separate databases from the start.** There's no shared infrastructure to accidentally cross — each environment is just a different `DATABASE_URL`/`DIRECT_URL` pair, set in a different place — but a copy-pasted connection string is the one way to actually mix them. After migrating a new database, run `npx tsx src/scripts/setEnvironmentMarker.ts <development|production>` against it once; the app then refuses to start if it's ever pointed at a database whose marker doesn't match, catching a swapped connection string at boot instead of silently mixing data.

## License

MIT — see [`LICENSE`](./LICENSE). Use it, fork it, run your own instance; just keep the copyright notice, and don't imply Riot affiliation or official status.
