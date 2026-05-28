import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      './packages/*',
      './apps/*',
      './fixtures/*',
      './tests/*',
    ],
    reporters: process.env.CI
      ? ['default', 'junit']
      : ['default'],
    outputFile: {
      junit: './test-results/junit.xml',
    },
  },
  coverage: {
    provider: 'v8',
    reporter: ['text', 'lcov'],
    thresholds: {
      statements: 70,
      branches: 60,
      functions: 70,
      lines: 70,
    },
  },
});
