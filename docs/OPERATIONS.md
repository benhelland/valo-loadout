# Operations

What this app runs on, what breaks without each piece, and the decisions that
only matter when something goes wrong. Written for coming back to this after
months away.

**No credentials live in this file, or anywhere else in this repo.** Every
value named below is an environment variable name, never a value. The real
values live in `.env.local` / `.env.production.local` (both gitignored) and in
Vercel's environment variables.

## The services

| Service | What it does here | What breaks without it | Where to manage |
|---|---|---|---|
| **Vercel** | Hosts the app; builds on push to `main` (production) and on any other branch (preview) | Everything | vercel.com → team `valo-loadout` → project `valoadout` |
| **Neon** | Postgres. Two separate databases: development and production | Everything | console.neon.tech |
| **Cloudflare** | Registrar and DNS for `valoadout.com` | The domain; the app stays reachable at its `.vercel.app` URL | dash.cloudflare.com |
| **Discord Developer Portal** | OAuth application (sign-in) and, once created, the notification bot | Sign-in, and therefore loadouts, wishlist, `/shop`, `/account` | discord.com/developers/applications |
| **GitHub** | Source, CI, branch ruleset on `main` | Deploys (Vercel builds from the repo) | github.com/benhelland/valo-loadout |
| **Anthropic** | Vibe-tagging at sync time only. Not used at runtime | Nothing at runtime; new skins sync without vibe tags | console.anthropic.com |
| **valorant-api.com** | Free community source for all skin/buddy data. Not ours, no SLA | The sync job; the app keeps serving whatever is already in the database | valorant-api.com |

## Environment variables, and where each is set

Names only. See `.env.example` for the full list.

| Variable | Local | Vercel Production | Vercel Preview |
|---|---|---|---|
| `DATABASE_URL` | dev database | production database | **dev** database |
| `DIRECT_URL` | dev database (owner role) | **not set** | **not set** |
| `RIOT_TOKEN_ENCRYPTION_KEY` | dev key | production key | **dev** key |
| `AUTH_SECRET` | local | production | its own, separate |
| `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET` | same everywhere | same | same |
| `CRON_SECRET` | local | production | same as production |
| `NEXT_PUBLIC_APP_URL` | not needed | `https://valoadout.com` | not set |
| `DISCORD_BOT_TOKEN` / `DISCORD_GUILD_ID` | optional | not yet provisioned | not set |
| `ANTHROPIC_API_KEY` | needed for sync | not needed | not needed |

Three of these are deliberate and easy to "fix" wrongly:

- **`DIRECT_URL` is absent from Vercel on purpose.** It is the owner-role
  credential. The running app connects as a least-privilege role that cannot
  alter the schema (`RISKS.md`). If a build ever fails asking for it, fix the
  build, not the privilege boundary — see `prisma.config.ts`.
- **Preview uses the dev database and the dev encryption key.** The key must
  pair with its database or linked Riot accounts will not decrypt.
- **Preview has its own `AUTH_SECRET`.** Sessions are JWT with no database
  lookup, so sharing it would let a cookie minted on a throwaway preview
  branch validate against production.

## Domain and DNS

`valoadout.com` is registered at Cloudflare, which means it must keep
Cloudflare's nameservers — pointing them at Vercel is not an option.

Two records, both **DNS only (grey cloud)**:

| Type | Name | Content |
|---|---|---|
| `CNAME` | `@` | `f474790b1e50e877.vercel-dns-017.com` |
| `CNAME` | `www` | same |

The grey cloud matters. Proxying (orange cloud) puts Cloudflare's TLS in front
of Vercel's, which on Cloudflare's default "Flexible" SSL mode produces a
redirect loop and blocks certificate issuance. Cloudflare will keep prompting
to enable proxying; ignore it. `www` redirects to the apex, configured in
Vercel's Domains settings rather than in DNS.

## Deployment protection

Vercel Authentication is **on**, scope "Standard Protection": production custom
domains are public, everything else requires a Vercel login. That means
`valoadout.com` is public while every `*.vercel.app` preview stays private —
the combination that was unavailable before the custom domain existed.

## Testing a preview that needs sign-in

Discord requires every OAuth redirect URI to be registered exactly; wildcards
are not supported. Preview deployments are served from a different host, so
signing in on one fails with "Invalid OAuth2 redirect_uri" until its callback
is registered.

Register the **branch alias**, which is stable for the life of the branch,
rather than the per-deployment hashed URL:

```
https://valoadout-git-<branch>-valo-loadout.vercel.app/api/auth/callback/discord
```

Slashes in the branch name become dashes. Only auth-gated pages need this —
the gallery, buddy gallery, skin pages and combo links work on any preview
with no configuration.

Usually easier: run `npm run dev` instead. Local development points at the
same dev database the previews use, and `localhost:3000` is already registered.

## Free-tier ceilings worth knowing

Vercel Hobby includes 6,000 build minutes, 100 GB transfer, 1M function
invocations, 100 deployments/day, and **5,000 image transformations covering
about 1,000 source images** per month.

**Image optimization is the meter that will run out first**, and it is the only
one that is structurally tight: the catalog is 2,242 unique source images
(1,358 skins plus 884 buddies) against an allowance of roughly 1,000. The meter
counts unique source images rather than requests, so casual browsing may never
approach it — but systematically paging the whole catalog would.

Build minutes are not a concern: at roughly 40 seconds a build, exhausting
6,000 minutes takes about 9,000 builds a month. Preview deployments cost build
minutes only. An idle deployment consumes no compute, because nothing runs
until a request arrives.

Note also that Hobby is **non-commercial use only**. Ads or donations, which
`RISKS.md` treats as normal for this space, would require Pro.

### The escape hatch: unoptimized images

If the image-optimization meter approaches its cap, bypass Vercel's optimizer
entirely by adding this to the `images` block in `next.config.ts`:

```ts
images: {
  unoptimized: true,
  // ...existing remotePatterns
}
```

**This is documented but deliberately not enabled.** It is a genuine tradeoff,
not a free win:

- **It removes the quota completely.** These images are already web-ready PNGs
  served from valorant-api.com's CDN, which this project links directly and
  never re-hosts. Running them through a quota-limited optimizer is a poor fit
  for a catalog larger than the allowance.
- **It makes pages roughly 7x heavier.** Source PNGs are 38–52 KB; optimized
  thumbnails are about 6 KB. A 50-card gallery page goes from ~310 KB of
  images to ~2.3 MB, which would make scrolling noticeably worse.

Enable it when the meter forces the choice, not before. Watch it under Vercel →
project → Usage → Image Optimization. Turning it on also makes the `quality`
prop on `SkinCard` and `BuddyCard` inert, since nothing is transformed.

## Where the shop poller runs — still unresolved

Vercel Cron cannot serve this job: Hobby allows only once-daily schedules, and
once daily is too coarse because shop resets are per-account and spread across
the day, so an account could be checked up to ~23 hours late. There is no
`vercel.json` cron block for that reason.

The remaining options are a scheduled GitHub Actions workflow (free now that
the repo is public, but a datacenter IP that Riot's Cloudflare may block) or
`npm run check-shops` from a machine that is not blocked. Until that question is
answered with evidence, the local script is the known-good path and `/account`
offers a manual "check shop now".

## Recovery notes

- **`RIOT_TOKEN_ENCRYPTION_KEY` has no backup but the env files.** Vercel will
  not show a Sensitive value again. Lose it and every linked Riot account
  becomes permanently undecryptable and every user must re-link. Keep the
  production key in a password manager. `src/scripts/rotateEncryptionKey.ts`
  handles planned rotation, but needs both keys alive — it cannot help if the
  old one is simply gone.
- **A new database needs three steps** after `prisma migrate deploy`:
  `src/scripts/setEnvironmentMarker.ts <development|production>`,
  `src/scripts/setupAppRole.ts` for the least-privilege role, and `npm run sync`
  to populate the catalog.
- **The app refuses to start** if `VERCEL_ENV`/`NODE_ENV` and the database's
  environment marker disagree. That is the guard against a connection string
  pasted into the wrong place, and it is working as intended — check which
  database the deployment is pointed at rather than removing the check.
