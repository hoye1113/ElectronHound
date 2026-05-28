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
      statements: 73,
      branches: 65,
      functions: 73,
      lines: 73,
    },
  },
});
