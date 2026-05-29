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
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: 4,
        minThreads: 2,
      },
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
