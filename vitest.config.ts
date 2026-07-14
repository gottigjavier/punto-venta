// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/main.ts'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@domain/*': path.resolve(__dirname, 'src/domain/*'),
      '@application/*': path.resolve(__dirname, 'src/application/*'),
      '@infrastructure/*': path.resolve(__dirname, 'src/infrastructure/*'),
      '@adapters/*': path.resolve(__dirname, 'src/adapters/*'),
      '@shared/*': path.resolve(__dirname, 'src/shared/*'),
    },
  },
});
