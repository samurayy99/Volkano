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
    ".agents/**",
    "docs+examples/**",
    // The WebGPU solver and renderers are plain JS written against TSL and are
    // not linted here — that is a separate pass. The engine's TYPESCRIPT
    // surface is linted: it is the contract every host codes against, and it
    // was silently unchecked while the riskiest changes landed in it.
    "src/flow-engine/**/*.js",
  ]),
]);

export default eslintConfig;
