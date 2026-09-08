import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Prisma client - not our code, don't lint it.
    "src/generated/**",
  ]),
  // Pages and components render to a browser and must not query the
  // database directly: a select-less read there is one careless prop away
  // from putting a stored credential (e.g. linked_riot_accounts'
  // encryptedRefreshToken) into an RSC payload. Add a function to
  // src/queries/ and call it instead - that layer is covered by
  // src/queries/payloadBudget.test.ts, which bounds every read's cost.
  {
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          // `patterns` alone covers both the `@/lib/db` alias and a relative
          // form like `../../lib/db` - a `paths` entry alongside it for the
          // exact specifier would match the same import a second time and
          // double every violation.
          patterns: [
            {
              group: ["**/lib/db"],
              message:
                "Pages and components must not query the database directly. Add a function to src/queries/ and call it instead.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
