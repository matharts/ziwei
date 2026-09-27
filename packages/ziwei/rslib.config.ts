import { defineConfig } from "@rslib/core";

export default defineConfig({
  source: {
    entry: { index: "./src/index.ts" },
    tsconfigPath: "./tsconfig.json",
  },
  lib: [
    {
      format: "esm",
      bundle: true,
      syntax: "es2022",
      dts: { bundle: { bundledPackages: ["@matharts/ziwei-shared"] }, abortOnError: true },
    },
  ],
  output: {
    // One platform-neutral ESM entry serves Node, browsers, and module Workers.
    target: "web",
    distPath: { root: "./dist" },
  },
});
