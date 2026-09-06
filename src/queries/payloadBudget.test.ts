import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Guards against the class of bug that consumed this project's monthly Neon
// transfer allowance: a query returning rows the UI never reads.
//
// The specific case was `prisma.buddy.findMany()` with no select and no
// limit, feeding a dropdown. It pulled all 884 buddies with every column -
// about 186 KB from the database and 260 KB of HTML - on every skin page
// view, roughly 40x the skin actually being viewed. Nothing failed; it was
// merely expensive, and only visible on a billing dashboard.
//
// The rule: a findMany must bound what it returns, either by columns
// (`select`) or by rows (`take`). Anything else must say why, so the cost is
// a decision on the record rather than an oversight.
//
// Deliberately NOT satisfied by `include:` alone - `include` pulls entire
// related rows, which is the expensive direction, not the cheap one.

const QUERY_DIR = join(process.cwd(), "src", "queries");
const OPT_OUT = "payload-ok:";

interface Call {
  file: string;
  line: number;
  args: string;
  preceding: string;
}

/** Argument text of each findMany call, located by paren matching. */
function findManyCalls(file: string, source: string): Call[] {
  const calls: Call[] = [];
  const needle = /prisma\.[a-zA-Z]+\.findMany\(/g;
  let m: RegExpExecArray | null;

  while ((m = needle.exec(source)) !== null) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let end = open;
    for (let i = open; i < source.length; i++) {
      if (source[i] === "(") depth++;
      else if (source[i] === ")") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const before = source.slice(0, m.index);
    calls.push({
      file,
      line: before.split("\n").length,
      args: source.slice(open + 1, end),
      preceding: before.split("\n").slice(-6).join("\n"),
    });
  }
  return calls;
}

describe("query payload budget", () => {
  const files = readdirSync(QUERY_DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

  it("finds the query modules to check", () => {
    assert.ok(files.length > 0, "no query modules found - has src/queries moved?");
  });

  for (const file of files) {
    const source = readFileSync(join(QUERY_DIR, file), "utf8");
    for (const call of findManyCalls(file, source)) {
      it(`${file}:${call.line} bounds what findMany returns`, () => {
        const narrowsColumns = /\bselect\s*:/.test(call.args);
        const boundsRows = /\btake\s*:/.test(call.args);
        const optedOut = call.preceding.includes(OPT_OUT);

        assert.ok(
          narrowsColumns || boundsRows || optedOut,
          `${file}:${call.line} calls findMany with neither select nor take, so it returns ` +
            `every column of every matching row. Add a select listing the columns the UI ` +
            `actually reads, a take to bound the rows, or a "// ${OPT_OUT} <reason>" comment ` +
            `above it if the full read is genuinely intended.`,
        );
      });
    }
  }
});
