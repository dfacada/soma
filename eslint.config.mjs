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
    // Not the Next app: Catalyst functions and scripts are CommonJS Node, docs hold the prototype.
    "catalyst/**",
    "docs/**",
    ".claude/**",
    // The polish loop's scratch: screenshots and the carry copy of the workflow (shots/<run>-carry.js).
    "shots/**",
  ]),
]);

export default eslintConfig;
