import { runDueShopChecks } from "@/store-check";
import { safeEqual } from "@/lib/crypto";

// One of two interchangeable triggers for the same job (the other is
// `npm run check-shops`). Both call runDueShopChecks(); neither owns any
// logic, so switching between them - or disabling this subsystem entirely by
// not scheduling either - costs nothing.
//
// Whether this route is the right trigger is an open question: Riot fronts
// these endpoints with Cloudflare, which is hardest on datacenter IPs, and
// Vercel is datacenter IPs. See docs/ARCHITECTURE.md "Store-check subsystem".

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Fail closed. An unauthenticated endpoint that makes outbound calls to
    // Riot on demand is exactly the "accidental hammering" risk
    // docs/ARCHITECTURE.md's security notes call out.
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }

  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!safeEqual(provided, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runDueShopChecks();
    return Response.json(summary);
  } catch (err) {
    // Deliberately generic: this response could end up in a platform log, and
    // an upstream error's own message is not guaranteed to be free of request
    // detail. The per-account reason is already recorded on each row.
    console.error("[check-shops] batch failed:", err instanceof Error ? err.name : "unknown error");
    return Response.json({ error: "Shop check batch failed" }, { status: 500 });
  }
}
