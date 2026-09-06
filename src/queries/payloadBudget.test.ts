import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Guards against a query returning rows the UI never reads.
//
// The case this was written for: `prisma.buddy.findMany()` with no select and
// no limit, feeding a dropdown. It pulled all 884 buddies with every column -
// about 186 KB from the database and 260 KB of HTML - on every skin page
// view, roughly 40x the skin actually being viewed. Nothing failed and no
// test caught it; it was merely expensive, which is invisible from inside the
// code.
//
// The rule: a findMany must bound what it returns, either by columns
// (`select`) or by rows (`take`). Anything else must say why, so the cost is
// a decision on the record rather than an oversight.
//
// Deliberately NOT satisfied by `include:` alone - `include` pulls entire
// related rows, which is the expensive direction, not the cheap one.

const QUERY_DIR = join(process.cwd(), "src", "queries");
const SRC_DIR = join(process.cwd(), "src");
const OPT_OUT = "payload-ok:";

interface Call {
  file: string;
  line: number;
  args: string;
  preceding: string;
}

/** Argument text of each matching prisma read, located by paren matching. */
function findManyCalls(file: string, source: string, method = "findMany"): Call[] {
  const calls: Call[] = [];
  const needle = new RegExp(String.raw`prisma\.[a-zA-Z]+\.` + method + String.raw`\(`, "g");
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

// A Prisma *select* object handed to an `include` position. This is a runtime
// error ("Invalid scalar field `id` for include statement"), and the type
// system cannot see it: excess property checking fires only on fresh object
// literals, so passing a select-shaped *variable* to `include` type-checks
// cleanly and fails on the first real query. `listSelect` is even declared
// `satisfies Prisma.SkinSelect` and that still does not help at the call site.
//
// Scanning for it is the only cheap guard. Naming the constant `...Select` is
// already the convention, so the name is the signal.
describe("select objects are not passed to include", () => {
  it("never uses a *Select constant in an include position", () => {
    const offenders: string[] = [];

    for (const file of readdirSync(SRC_DIR, { recursive: true, encoding: "utf8" })) {
      if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
      if (file.endsWith(".test.ts")) continue;

      const source = readFileSync(join(SRC_DIR, file), "utf8");
      source.split("\n").forEach((line, i) => {
        // Catches `include: listSelect` directly, and the nested form
        // `include: { skin: { include: listSelect } }` via its inner match.
        const match = /\binclude:\s*(\w*Select)\b/.exec(line);
        if (match) offenders.push(`${file}:${i + 1} - include: ${match[1]}`);
      });
    }

    assert.deepEqual(
      offenders,
      [],
      `A Prisma select object is being passed to include. Use \`select:\` instead:\n${offenders.join("\n")}`,
    );
  });
});

// A single-row read cannot return too many *rows*, so `take` is irrelevant and
// the findMany rule above does not apply. It can still return too many
// *columns*: `include` pulls every column of the row and of every relation it
// names, and a detail page typically reads a fraction of them. On the most
// requested pages that difference is paid on every request.
describe("single-row reads bound their columns", () => {
  for (const file of readdirSync(QUERY_DIR)) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
    const source = readFileSync(join(QUERY_DIR, file), "utf8");

    for (const method of ["findUnique", "findFirst"] as const) {
      for (const call of findManyCalls(file, source, method)) {
        it(`${file}:${call.line} bounds what ${method} returns`, () => {
          if (call.preceding.includes(OPT_OUT)) return;
          assert.ok(
            call.args.includes("select:"),
            `${file}:${call.line} calls ${method} without a select, so it returns every column ` +
              `of the row and of any relation it includes. Use \`select\` to name the columns the ` +
              `caller actually reads, or explain the cost with a \`// ${OPT_OUT} <reason>\` comment.`,
          );
        });
      }
    }
  }
});
