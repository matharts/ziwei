import { fileURLToPath } from "node:url";

import { defineConfig } from "@rstest/core";

export default defineConfig({
  name: "ziwei-wasm",
  root: fileURLToPath(new URL(".", import.meta.url)),
  testEnvironment: "node",
  include: ["test/*.test.ts"],
  exclude: ["test/contract.test.ts"],
  testTimeout: 60_000,
  output: {
    externals: {
      "@matharts/ziwei-wasm": "import @matharts/ziwei-wasm",
      "@matharts/ziwei": "import @matharts/ziwei",
      playwright: "import playwright",
      vite: "import vite",
      "@rslib/core": "import @rslib/core",
      "./fixtures/browser.ts": `import ${new URL("./test/fixtures/browser.ts", import.meta.url).href}`,
      "./fixtures/browser-edge.ts": `import ${new URL("./test/fixtures/browser-edge.ts", import.meta.url).href}`,
    },
  },
  tools: { rspack: { module: { parser: { javascript: { worker: false } } } } },
});
