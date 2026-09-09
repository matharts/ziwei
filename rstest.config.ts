import { fileURLToPath } from 'node:url';
import { defineConfig, defineInlineProject } from '@rstest/core';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  pool: { type: 'forks' },
  projects: [
    defineInlineProject({
      name: 'core',
      root: fileURLToPath(new URL('./packages/core/', import.meta.url)),
      testEnvironment: 'node',
      include: ['test/*.test.ts'],
      exclude: ['test/contract.test.ts'],
      // The built Node-API package must use Node's loader, not Rspack's module cache.
      output: {
        externals: {
          '@ziweijs/core': 'import @ziweijs/core',
          '../native/binding.cjs': `import ${new URL('./packages/core/native/binding.cjs', import.meta.url).href}`,
        },
      },
      // Worker fixtures run from source in real Node worker_threads.
      tools: { rspack: { module: { parser: { javascript: { worker: false } } } } },
      testTimeout: 60_000,
    }),
    defineInlineProject({
      name: 'node-tools',
      root: fileURLToPath(new URL('.', import.meta.url)),
      testEnvironment: 'node',
      include: ['tools/tests/*.test.ts'],
      testTimeout: 60_000,
    }),
    defineInlineProject({
      name: 'node-bench',
      root: fileURLToPath(new URL('./packages/core/', import.meta.url)),
      testEnvironment: 'node',
      include: ['bench/*.test.ts'],
      testTimeout: 180_000,
    }),
  ],
});
