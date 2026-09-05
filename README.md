# valo-loadout

A webapp for VALORANT cosmetics: build your ideal loadout across every weapon, wishlist the skins you want, browse every skin/animation ever released in a UI that actually shows them off, and get a Discord DM the moment something on your wishlist shows up in your daily store.

**Status:** Phases 1–3 feature-complete (gallery, loadout builder, sharing, Discord auth, Riot store-check, wishlist, and Discord bot notifications all built and verified against live Riot/Discord) - not yet deployed. See [`docs/ROADMAP.md`](./docs/ROADMAP.md) for exactly what's done and what's left, and [`docs/LAUNCH_CHECKLIST.md`](./docs/LAUNCH_CHECKLIST.md) for the remaining deploy steps.

Not affiliated with or endorsed by Riot Games. VALORANT and all associated assets are property of Riot Games, Inc. Skin/cosmetic data courtesy of [valorant-api.com](https://valorant-api.com), an unofficial community project.

## Read this first

- [`CLAUDE.md`](./CLAUDE.md) — the single source of truth for how this project works, its non-negotiables (never persist a password, encrypt tokens at rest, rate-limit Riot calls), and every command below
- [`docs/PRD.md`](./docs/PRD.md) — what this is, who it's for, feature scope
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — stack, data model, and the full writeup of how the Riot store-check and Discord notification subsystems actually work
- [`docs/RISKS.md`](./docs/RISKS.md) — the ToS/account-risk tradeoffs this project knowingly accepts (Riot's *unofficial* internal API, not the public one - see below), and the guardrails that decision implies, including a database-breach audit
- [`docs/ROADMAP.md`](./docs/ROADMAP.md) — phased build history and what's still ahead
- [`FEATURES.md`](./FEATURES.md) — a running list of technical features and the real bugs/tradeoffs behind them, for anyone getting a tour of the codebase

## A word on how this works

Store notifications ("your wishlisted skin is in today's shop") aren't possible through Riot's official, sanctioned API - by Riot's own admission, "the technology for this does not currently exist" there. This project reads a linked account's shop the same way community tools have for years: the same internal endpoints the game client itself calls, authenticated via Riot's own OAuth sign-in page (never a password - see `docs/ARCHITECTURE.md`). That's a deliberate, accepted tradeoff, not an oversight - read `docs/RISKS.md` before assuming this should "just use the real API."

## Setup

Nothing here works end-to-end without your own Neon Postgres project, Discord application, and (optionally) Anthropic API key - see `.env.example` for the full list and `CLAUDE.md`'s "Local setup" section for what each one is for.

```bash
npm install
cp .env.example .env.local   # fill in a real Neon DATABASE_URL / DIRECT_URL, Discord app credentials, etc.
npx prisma generate
npx prisma migrate deploy    # apply the schema to your database
npm run sync                 # populate the skin/buddy catalog from valorant-api.com
npm run dev
```

**If you fork this to run your own instance, keep dev and production on separate databases from the start.** There's no shared infrastructure to accidentally cross - each environment is just a different `DATABASE_URL`/`DIRECT_URL` pair, set in a different place (`.env.local` locally, your hosting platform's environment variables in production) - but a copy-pasted connection string is the one way to actually jumble them, so treat those values with the same care as any other credential.

## License

MIT - see [`LICENSE`](./LICENSE). Use it, fork it, run your own instance - just keep the copyright notice, and don't imply Riot affiliation or official status (see disclaimer above).
