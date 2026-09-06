/**
 * Reads, and optionally sets, the hard consumption ceiling on the Neon
 * project. Also prints this billing period's usage against that ceiling.
 *
 *   npm run neon-quota             # show the current ceiling and usage
 *   npm run neon-quota -- --apply  # write the ceiling from the env vars below
 *
 * Why this exists: Neon's console has no spend cap. It has *spending
 * notifications* - email at 80% and 100% of a threshold - which report that a
 * bill is growing but do not stop it. The only mechanism that actually stops
 * spend is the per-project `settings.quota` object, which is settable through
 * the management API alone. That is what this script drives.
 *
 * What reaching the ceiling does: every compute in the project is suspended,
 * and the suspension is persistent - it does NOT wake on the next connection
 * or query. The app stays down until the next billing period begins or the
 * ceiling is raised by hand. `logical_size_bytes` is the one exception: it
 * cuts off writes to the offending branch rather than the whole project.
 *
 * Usage counters reset each billing period. The ceiling itself persists, so
 * this only needs re-running when the ceiling should change.
 *
 * The ceiling values are read from the environment and have no defaults, so
 * this file holds none of them. Deciding the numbers means pricing them
 * against a specific plan, which is account detail and belongs in the
 * gitignored operations notes, not here.
 *
 * Required in .env.local (see CLAUDE.md - these are credentials):
 *   NEON_PROD_API_KEY     - Neon org Settings -> API keys -> Project-scoped
 *   NEON_PROD_PROJECT_ID  - Neon console -> Project -> Settings -> General,
 *                           or the last segment of the project's console URL
 *
 * The PROD_ in both names is load-bearing. These select which project is
 * *administered*, a different axis from DATABASE_URL / DIRECT_URL selecting
 * which database the app *talks to* - so pointing them at production while
 * the database vars point at a dev branch is the normal, correct combination
 * on a development machine. Capping a dev project would protect nothing.
 *
 * Required only for --apply:
 *   NEON_QUOTA_COMPUTE_SECONDS      CPU seconds; 1 CU-hour = 3600 at 1 CU
 *   NEON_QUOTA_ACTIVE_SECONDS       wall-clock seconds a compute may be awake
 *   NEON_QUOTA_TRANSFER_BYTES       egress across all branches
 *   NEON_QUOTA_WRITTEN_BYTES        bytes written across all branches
 *   NEON_QUOTA_LOGICAL_SIZE_BYTES   stored size, per branch
 */

const API = "https://console.neon.tech/api/v2";

const GB = 1024 ** 3;
const HOUR = 3600;

const QUOTA_ENV = {
  compute_time_seconds: "NEON_QUOTA_COMPUTE_SECONDS",
  active_time_seconds: "NEON_QUOTA_ACTIVE_SECONDS",
  data_transfer_bytes: "NEON_QUOTA_TRANSFER_BYTES",
  written_data_bytes: "NEON_QUOTA_WRITTEN_BYTES",
  logical_size_bytes: "NEON_QUOTA_LOGICAL_SIZE_BYTES",
} as const;

type QuotaField = keyof typeof QUOTA_ENV;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Add it to .env.local.`);
  return value;
}

/**
 * Every field is required for --apply. Neon treats a zero or absent value as
 * "unlimited", so a partially-filled quota silently leaves whichever field was
 * forgotten with no ceiling at all - the exact failure this script exists to
 * prevent. Refusing outright is the only safe reading of a partial config.
 */
function readQuotaFromEnv(): Record<QuotaField, number> {
  const missing: string[] = [];
  const quota = {} as Record<QuotaField, number>;

  for (const [field, envVar] of Object.entries(QUOTA_ENV) as Array<[QuotaField, string]>) {
    const raw = process.env[envVar];
    if (!raw) {
      missing.push(envVar);
      continue;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`${envVar} must be a positive number, got: ${raw}`);
    }
    quota[field] = Math.floor(parsed);
  }

  if (missing.length > 0) {
    throw new Error(
      `Refusing to apply a partial ceiling. Neon reads a missing value as unlimited, ` +
        `so the fields left out would end up with no cap.\nMissing: ${missing.join(", ")}`,
    );
  }

  warnIfActiveTimeBindsFirst(quota);
  return quota;
}

/** The lowest CU a Neon compute can autoscale down to. */
const MIN_CU = 0.25;

/**
 * `compute_time_seconds` is CPU seconds; `active_time_seconds` is wall clock.
 * They are not independent: at 0.25 CU an hour of wall clock costs only 900
 * CPU seconds, so a wall-clock cap set too low binds *first* and suspends the
 * project well below the dollar figure the compute number implies.
 *
 * A warning rather than an error, because a deliberately tight wall-clock cap
 * is a legitimate choice - it just should not be an accidental one.
 */
function warnIfActiveTimeBindsFirst(quota: Record<QuotaField, number>): void {
  const floor = quota.compute_time_seconds / MIN_CU;
  if (quota.active_time_seconds >= floor) return;

  const effectiveCuHours = (quota.active_time_seconds * MIN_CU) / 3600;
  const impliedCuHours = quota.compute_time_seconds / 3600;
  console.warn(
    `\nWarning: active_time_seconds (${quota.active_time_seconds}) is below ` +
      `compute_time_seconds / ${MIN_CU} (${Math.ceil(floor)}).\n` +
      `At ${MIN_CU} CU the wall-clock cap binds first, so the project suspends after about ` +
      `${effectiveCuHours.toFixed(1)} CU-hours instead of the ${impliedCuHours.toFixed(1)} ` +
      `the compute cap implies.\n` +
      `Raise active_time_seconds above ${Math.ceil(floor)} to make compute the binding limit.\n`,
  );
}

async function api(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${requireEnv("NEON_PROD_API_KEY")}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const body = await res.text();
  if (!res.ok) {
    // Deliberately does not echo the request, which carries the API key.
    throw new Error(`Neon API ${res.status} on ${path}: ${body.slice(0, 400)}`);
  }
  return JSON.parse(body);
}

interface ProjectResponse {
  project: {
    name: string;
    settings?: { quota?: Partial<Record<QuotaField, number>> };
    compute_time_seconds?: number;
    active_time_seconds?: number;
    data_transfer_bytes?: number;
    written_data_bytes?: number;
    consumption_period_start?: string;
    consumption_period_end?: string;
  };
}

const gb = (bytes: number) => `${(bytes / GB).toFixed(2)} GB`;
const hrs = (seconds: number) => `${(seconds / HOUR).toFixed(1)} h`;

async function main() {
  const projectId = requireEnv("NEON_PROD_PROJECT_ID");
  const apply = process.argv.includes("--apply");

  // Identify the target BEFORE mutating it. NEON_PROD_PROJECT_ID selects which
  // project is *administered*, which is a different axis from DATABASE_URL /
  // DIRECT_URL selecting which database the app *talks to* - so the two
  // routinely point at different environments in the same .env.local (dev
  // database, production project, because production is the one that bills).
  // That is intentional, but it means a mix-up is easy and invisible, so the
  // project is named before anything is written rather than after.
  let { project } = (await api(`/projects/${projectId}`)) as ProjectResponse;

  console.log(`Project: ${project.name}  (${projectId})`);
  console.log("  ^ from NEON_PROD_PROJECT_ID - unrelated to DATABASE_URL / DIRECT_URL.\n");

  if (apply) {
    const quota = readQuotaFromEnv();
    console.log(`Applying ceiling to "${project.name}":`);
    for (const [field, value] of Object.entries(quota)) console.log(`  ${field} = ${value}`);
    await api(`/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify({ project: { settings: { quota } } }),
    });
    console.log("\nApplied.\n");
    // Re-read so the table below reflects what was just written.
    ({ project } = (await api(`/projects/${projectId}`)) as ProjectResponse);
  }

  const quota = project.settings?.quota ?? {};

  console.log(
    `Billing period: ${project.consumption_period_start ?? "?"} -> ${project.consumption_period_end ?? "?"}\n`,
  );

  const rows: Array<[QuotaField, number | undefined, (n: number) => string]> = [
    ["compute_time_seconds", project.compute_time_seconds, hrs],
    ["active_time_seconds", project.active_time_seconds, hrs],
    ["data_transfer_bytes", project.data_transfer_bytes, gb],
    ["written_data_bytes", project.written_data_bytes, gb],
  ];

  for (const [field, used, fmt] of rows) {
    const limit = quota[field];
    const usedText = used === undefined ? "?" : fmt(used);
    if (!limit) {
      console.log(`  ${field.padEnd(22)} ${usedText.padStart(12)}  / UNLIMITED  <-- no ceiling`);
      continue;
    }
    const pct = used === undefined ? "" : ` (${((used / limit) * 100).toFixed(1)}%)`;
    console.log(`  ${field.padEnd(22)} ${usedText.padStart(12)}  / ${fmt(limit)}${pct}`);
  }

  const size = quota.logical_size_bytes;
  console.log(
    `  ${"logical_size_bytes".padEnd(22)} ${"per-branch".padStart(12)}  / ${
      size ? gb(size) : "UNLIMITED  <-- no ceiling"
    }`,
  );

  const unset = (Object.keys(QUOTA_ENV) as QuotaField[]).filter((field) => !quota[field]);
  if (unset.length > 0) {
    console.log(`\nNo ceiling set for: ${unset.join(", ")}`);
    console.log("Set the NEON_QUOTA_* vars in .env.local, then run with --apply.");
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
