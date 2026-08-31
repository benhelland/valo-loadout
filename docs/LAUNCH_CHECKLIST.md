# Launch checklist

Concrete, mechanical action items to do right before/during deploying this app for real - distinct from `ROADMAP.md`, which tracks feature phases, not launch-day steps. Check items off as they're done; add new ones here as they come up rather than letting them live only in chat history.

## Discord OAuth

- [ ] Add a second OAuth2 redirect URI in the [Discord Developer Portal](https://discord.com/developers/applications) (app → OAuth2 → Redirects) for the production domain, alongside the existing local one:
  ```
  https://<production-domain>/api/auth/callback/discord
  ```
  Local dev (`http://localhost:3000/api/auth/callback/discord`) is already registered - don't remove it, both need to coexist so local dev keeps working after this is added.
- [ ] Set `AUTH_DISCORD_ID` / `AUTH_DISCORD_SECRET` / `AUTH_SECRET` as real environment variables on the hosting platform (Vercel) - not just in local `.env.local`. Generate a **separate** `AUTH_SECRET` for production rather than reusing the local dev one (`openssl rand -base64 32`).
- [ ] Confirm `AUTH_URL` (or Auth.js's auto-detection via request headers) resolves correctly behind Vercel's proxy - Auth.js v5 usually auto-detects via `x-forwarded-host`, but verify a real sign-in round-trip on the deployed domain before calling this done, don't assume.

## Discord bot (notifications)

- [ ] Create a bot user on the same Discord application used for OAuth (Developer Portal → Bot → "Add Bot"), copy its token into `DISCORD_BOT_TOKEN` on the hosting platform - not just local `.env.local`.
- [ ] Create (or designate) a Discord server for the bot to live in, invite the bot with at least `CREATE_INSTANT_INVITE`, and set `DISCORD_GUILD_ID` to that server's id, also on the hosting platform.
- [ ] Set `NEXT_PUBLIC_APP_URL` to the real production domain - notification DMs link back into the app using this value.
- [ ] Without the two vars above, sign-in and shop checks still work fine - `src/discord/bot.ts` no-ops - but no notification will ever actually send. Don't treat a quiet failure to configure this as "notifications are broken", verify the env vars are actually set on the deployed environment.
- [ ] Verify end-to-end on the deployed app before calling this done: sign in with a real Discord account, confirm it lands in the configured guild, wishlist a skin that's genuinely in that account's current shop (or trigger a check right after linking), and confirm the DM actually arrives - this has not yet been tested against a real bot/server (see `ROADMAP.md`).

## Store-check subsystem (Riot linking)

- [ ] Set `RIOT_TOKEN_ENCRYPTION_KEY` in production - **generate a fresh one, don't copy the dev value** (`openssl rand -base64 32`). Note that dev-linked accounts won't decrypt in production, and vice versa; that's expected, users re-link.
- [ ] Set `CRON_SECRET` in production if using the hosted cron trigger. Without it `/api/cron/check-shops` fails closed with a 503 (by design - it makes outbound Riot calls, so it must never be open).
- [ ] Add the cron schedule to `vercel.json` if going that route, e.g. hourly: the job itself only polls accounts whose `nextPollAt` has passed, so a frequent trigger does **not** mean frequent Riot calls.
- [ ] **Decide where the poller actually runs, with evidence.** Riot fronts these endpoints with Cloudflare, which is hardest on datacenter IPs - and Vercel/GitHub Actions are datacenter IPs. Test the hosted route against a real linked account once; if it comes back `CAPTCHA_BLOCKED`, move the job to `npm run check-shops` on a machine with a residential connection. Do **not** "fix" this with proxies - see `RISKS.md`.
- [ ] Sanity-check that a linked account survives a deploy (the encrypted cookie is in Postgres, not in any instance's memory, so it should - verify rather than assume).
