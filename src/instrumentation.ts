// Next.js's own hook for one-time startup work, run once per server
// instance rather than per-request - see
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation.
// Stable in this Next.js version (16.3.3), no config flag needed.
//
// Guarded to the Node.js runtime: `register()` also fires for the Edge
// runtime (which src/proxy.ts could theoretically run under), and Prisma
// isn't Edge-compatible - importing it unconditionally here would break that
// bundle. This project's proxy.ts doesn't currently import anything that
// would trigger this, but the guard costs nothing and avoids a footgun for
// whoever adds Edge-runtime code later.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { verifyEnvironment } = await import("@/lib/verifyEnvironment");
    await verifyEnvironment();
  }
}
