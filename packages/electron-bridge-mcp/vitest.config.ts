import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      { find: /(.*)\.js$/, replacement: '$1' },
    ],
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
