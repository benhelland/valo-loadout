import test from "node:test";
import assert from "node:assert/strict";
import {
  MAINTENANCE_STATUS,
  isMaintenanceEnabled,
  isValidBypass,
  maintenanceHtml,
} from "./maintenance";

// Maintenance mode is a cost control: it is the switch that stops the site
// generating database spend. A regression that quietly leaves it off, or one
// that lets anyone bypass it, defeats the purpose - so both directions are
// pinned here.

function withEnv(vars: Record<string, string | undefined>, run: () => void) {
  const saved = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(vars)) {
    saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("maintenance mode is off unless MAINTENANCE_MODE is exactly '1'", () => {
  // Anything truthy-looking but not "1" must NOT enable it. Taking the site
  // down by accident is its own kind of outage.
  for (const value of [undefined, "", "0", "true", "yes", "on", "2", " 1", "1 "]) {
    withEnv({ MAINTENANCE_MODE: value }, () => {
      assert.equal(isMaintenanceEnabled(), false, `expected off for ${JSON.stringify(value)}`);
    });
  }
});

test("maintenance mode is on for '1'", () => {
  withEnv({ MAINTENANCE_MODE: "1" }, () => {
    assert.equal(isMaintenanceEnabled(), true);
  });
});

test("bypass rejects a wrong, empty, partial or absent candidate", () => {
  const secret = "correct-horse-battery-staple";
  assert.equal(isValidBypass(undefined, secret), false);
  assert.equal(isValidBypass("", secret), false);
  assert.equal(isValidBypass("wrong", secret), false);
  // A prefix must not pass - the comparison checks length before content.
  assert.equal(isValidBypass(secret.slice(0, -1), secret), false);
  assert.equal(isValidBypass(`${secret}x`, secret), false);
});

test("bypass accepts the exact secret", () => {
  const secret = "correct-horse-battery-staple";
  assert.equal(isValidBypass(secret, secret), true);
});

test("the maintenance page is self-contained", () => {
  const html = maintenanceHtml();
  // The response must not depend on /_next/* being reachable, because the
  // proxy blocks every path while maintenance is on. Any external reference
  // would render a broken page during the outage.
  assert.ok(!/<script/i.test(html), "must not load scripts");
  assert.ok(!/<link\b/i.test(html), "must not load stylesheets");
  assert.ok(!/_next\//.test(html), "must not reference build output");
  assert.ok(html.includes("<style>"), "styles must be inline");
});

test("maintenance responds 503, not 200", () => {
  // A 200 would let search engines index the notice in place of real content.
  // 503 with Retry-After is the documented "temporarily down" signal.
  assert.equal(MAINTENANCE_STATUS, 503);
});
