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
