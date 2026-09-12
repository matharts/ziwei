import { fileURLToPath } from "node:url";

import { defineConfig, defineInlineProject } from "@rstest/core";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  pool: { type: "forks" },
  projects: [
    defineInlineProject({
      name: "ziwei",
      root: fileURLToPath(new URL("./packages/ziwei/", import.meta.url)),
      testEnvironment: "node",
      include: ["test/*.test.ts"],
      exclude: ["test/contract.test.ts"],
      // The built Node-API package must use Node's loader, not Rspack's module cache.
      output: {
        externals: {
          "@matharts/ziwei": "import @matharts/ziwei",
          "../native/binding.cjs": `import ${new URL("./packages/ziwei/native/binding.cjs", import.meta.url).href}`,
        },
      },
      // Worker fixtures run from source in real Node worker_threads.
      tools: { rspack: { module: { parser: { javascript: { worker: false } } } } },
      testTimeout: 60_000,
    }),
    defineInlineProject({
      name: "node-tools",
      root: fileURLToPath(new URL(".", import.meta.url)),
      testEnvironment: "node",
      include: ["tools/tests/*.test.ts"],
      testTimeout: 60_000,
    }),
    defineInlineProject({
      name: "node-bench",
      root: fileURLToPath(new URL("./packages/ziwei/", import.meta.url)),
      testEnvironment: "node",
      include: ["bench/*.test.ts"],
      testTimeout: 180_000,
    }),
    defineInlineProject({
      name: "node-tools-linux",
      root: fileURLToPath(new URL(".", import.meta.url)),
      testEnvironment: "node",
      include: ["tools/tests/linux/*.test.ts"],
      testTimeout: 60_000,
    }),
  ],
});
