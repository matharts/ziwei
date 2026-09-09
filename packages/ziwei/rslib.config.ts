import { defineConfig } from '@rslib/core';

export default defineConfig({
  source: {
    entry: { index: ['src/**/*.ts'] },
    tsconfigPath: './tsconfig.json',
  },
  lib: [
    {
      format: 'esm',
      bundle: false,
      syntax: 'es2022',
      dts: { abortOnError: true },
    },
  ],
  output: {
    target: 'node',
    distPath: { root: './dist' },
    // The generated loader and .node binary remain outside the JS build.
    externals: { '../native/binding.cjs': 'module ../native/binding.cjs' },
  },
});
