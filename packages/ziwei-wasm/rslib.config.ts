import { defineConfig } from "@rslib/core";

export default defineConfig({
  source: { entry: { index: "./src/index.ts" }, tsconfigPath: "./tsconfig.json" },
  lib: [
    { format: "esm", bundle: true, syntax: "es2022", dts: { bundle: true, abortOnError: true } },
  ],
  output: {
    target: "web",
    distPath: { root: "./dist" },
    // A Wasm URL must remain a separate, auditable resource, including tiny test builds.
    dataUriLimit: 0,
  },
});
