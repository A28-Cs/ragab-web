import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: 'forks',
    // Integration suites share ONE Postgres; run files serially so they never race
    // on shared rows (e.g. category counts). Unit tests are unaffected.
    fileParallelism: false,
  },
});
