import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      { find: /(.*)\.js$/, replacement: '$1' },
    ],
  },
  test: {
    include: ['**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 30_000,
  },
});
