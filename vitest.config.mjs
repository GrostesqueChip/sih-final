import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    testTimeout: 10000,
    hookTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['server/src/**/*.js', 'client/src/utils/**/*.js', 'client/src/services/**/*.js'],
      exclude: ['node_modules/**', 'tests/**'],
    },
  },
});
