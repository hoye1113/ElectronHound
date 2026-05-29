import { defineConfig } from 'vitest/config';

export default defineConfig({
  bench: {
    include: ['benchmarks/**/*.bench.ts'],
    reporters: ['default'],
    outputJson: 'benchmarks/current.json',
  },
  test: {
    passWithNoTests: true,
  },
});
