# Technical Features

A running list of the technical features behind valo-loadout, for anyone getting a tour of the codebase. This is a feature/engineering highlight reel, not a design rationale doc — see `docs/ARCHITECTURE.md` for the "why" behind any of it, and `docs/ROADMAP.md` for what's still ahead.

valo-loadout is a VALORANT cosmetics webapp: a full-catalog skin gallery, a loadout builder, and (planned) a wishlist with live shop notifications — built on Next.js, Prisma, and a Postgres database synced from the community-maintained valorant-api.com.

## Content pipeline

- **Full-catalog sync job** — pulls every weapon, skin, upgrade level, color chroma, buddy, content tier, and theme from valorant-api.com and upserts it into Postgres. Idempotent (safe to re-run), bounded-concurrency batched so it doesn't hammer the upstream API.
- **Color-family extraction** — dominant-color clustering (via `node-vibrant`) buckets every skin and chroma into a named color family (red, gold, multicolor, etc.) at sync time, powering the gallery's color filter with zero runtime cost.
- **AI vibe-tagging pipeline** — Claude Haiku classifies each skin's showcase image against a fixed vocabulary (dark, sleek, futuristic, neon, anime, …) using structured outputs, so the "vibe" filter reflects actual visual style rather than just metadata.
- **Reliable chroma ordering** — added a `chromaIndex` column to preserve the API's own array order, fixing a real bug where "the base/default chroma" wasn't reliably the first one returned by a query with no explicit order (some skins' base color was silently getting swapped for a recolor).
- **Smart image/video fallback chains** — resolves the best available asset per context: prefers a level's own art when a skin has genuine level-to-level visual progression, falls back to the higher-resolution chroma render when it doesn't; falls through level → chroma video when a specific color variant has no dedicated animation of its own. Tuned against real data, not guessed.
- **Non-skin entries filtered from browsing** — the ~40 "Standard" reskins and "Random Favorite" placeholders valorant-api.com includes per weapon are hidden from the gallery (they're not real skins to look at) while staying in the database for the loadout builder's future "no skin" / "random" choice.

## Gallery & search

- **Fuzzy predictive search** — a hand-rolled subsequence-matching scorer (not plain substring matching), so typos and skipped letters still find the right skin — e.g. "eldervndl" surfaces "Elderflame Vandal". The same scorer drives both the instant dropdown suggestions and the main grid's live filtering, so they're always consistent with each other.
- **Auto-applying filter bar** — every filter (weapon, tier, collection, color, vibe, sort, animation, search) applies immediately on change via client-side URL navigation. No "Apply" button, no full page reloads — and all filter state still lives in the URL, so every view is a real, shareable, bookmarkable link.
- **Rarity-first default sort** — chosen deliberately after confirming the "obvious" default (newest) was actually meaningless for a one-time-backfilled catalog.
- **Standalone buddy gallery** (`/buddies`) — a denser browse grid sized for how small buddy icons actually are, reachable from the skin gallery via a lightweight secondary tab without competing with it as the main landing page.
- **Stateless combo share links** — a skin + level + chroma + buddy combination encodes directly into a URL (`/combo/:encoded`, base64url) with zero database row. Anyone can share or bookmark an exact configuration instantly, with nothing to clean up or expire.

## Skin detail experience

- **VALORANT client-inspired design system** — condensed display typography, angular clipped-corner UI elements, and a color palette pulled from the real client's own visual language, applied consistently across the app rather than a generic dashboard look.
- **Image/Animation toggle** — defaults to a still render (no autoplay-on-load flash while browsing levels/chromas), with video as an explicit opt-in tab. A "Now showing: X" caption surfaces the exact chroma variant name straight from the API response.
- **Moveable, resizable buddy badge** — drag to reposition and resize the buddy preview anywhere within the media frame, built entirely on native Pointer Events (no drag library) so mouse, touch, and pen all work identically. Clamped to sane size bounds and to stay fully inside the frame regardless of position or size.
- **Auto-fading badge chrome** — the badge's background/border/resize-grip reveal on load or interaction and fade to fully transparent after a couple of idle seconds, leaving just the buddy icon — a small polish detail that took real care to get right without visual jank (see the engineering notes below).

## Loadout builder

- **Board layout matches a real reference chart** — a category-grouped grid (Sidearms / SMGs+Shotguns / Rifles+Melee / Snipers+Heavy), every weapon slot visible at once, not tucked behind tabs.
- **Picker and assignment reuse the gallery itself** — the "pick a skin for this slot" flow isn't a parallel UI; it's the same filter bar and the same skin detail page, with one extra "Add to Loadout" action bolted on. Building a loadout feels like an extension of browsing, not a separate form.
- **View / Replace popup** on filled slots — "View" jumps to the exact saved combo (level/chroma/buddy) via the same combo-link codec used for sharing, not the skin's defaults.
- **State-preserving re-edit** — reopening an already-assigned skin to tweak just the buddy keeps the previously chosen level/chroma instead of resetting everything.
- **Multiple named loadouts** — duplicate, rename, delete, a quick switcher between them, and a running estimated VP total computed live from a static tier-price table.

## Architecture & engineering notes

- **Next.js App Router, Server Components, and Server Actions throughout** — no hand-rolled REST API layer; mutations are plain async functions called directly from client components.
- **Prisma 7 + Neon's serverless driver adapter** — Postgres that scales to zero, no traditional connection pool to manage.
- **A single swap point for auth** — the loadout builder was built against a mock user before real accounts exist, on purpose. Every query and mutation reads "who's logged in" through one function (`getCurrentUserId()`), so wiring up real Discord OAuth later is a one-function change, not a codebase-wide refactor.
- **Fully URL-driven gallery state** — filters, sort, and pagination all live in the URL rather than client-only state, so results stay server-rendered and every filtered view is a real link.
- **Built around React's stricter concurrent-rendering rules, not against them** — this codebase enforces lint rules against synchronous `setState` inside effects and against reading/writing refs during render. Rather than suppressing them, several features (the search box's controlled state, the loadout board's category switching, the buddy badge's fade timer) were built using React's own recommended alternative patterns — deriving state during render instead of syncing it in an effect, and gating timer callbacks with refs instead of racing dependency arrays.
