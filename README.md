# valo-loadout

A webapp for VALORANT cosmetics: build your ideal loadout, wishlist the skins you want, browse every skin and its animations in a UI worth spending time in, and get notified when something on your wishlist shows up in your daily store.

**Status:** Phase 1 in progress (sync job + skin gallery). See [`docs/`](./docs) for the product and technical plan.

Not affiliated with or endorsed by Riot Games. VALORANT and all associated assets are property of Riot Games, Inc.

## Docs

- [`docs/PRD.md`](./docs/PRD.md) — what this is, who it's for, feature scope
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — proposed stack, data model, how store-notifications work
- [`docs/ROADMAP.md`](./docs/ROADMAP.md) — phased build plan
- [`docs/RISKS.md`](./docs/RISKS.md) — the ToS/account-risk tradeoffs this project accepts, and how it mitigates them

## Setup

```bash
npm install
cp .env.example .env.local   # fill in a real Neon DATABASE_URL / DIRECT_URL, etc.
npx prisma generate
npm run dev
```

See `CLAUDE.md` for the full command reference and local-setup notes.
