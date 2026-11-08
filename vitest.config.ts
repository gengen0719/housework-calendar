import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**', 'infrastructure/lib/**'],
      thresholds: { lines: 80 },
    },
    projects: [
      {
        test: {
          name: 'shared',
          root: './packages/shared',
          environment: 'node',
          include: ['test/**/*.{test,spec}.ts', 'test/**/*.feature'],
        },
      },
      {
        test: {
          name: 'backend',
          root: './packages/backend',
          environment: 'node',
          include: ['test/**/*.{test,spec}.ts', 'test/**/*.steps.ts'],
        },
      },
      {
        test: {
          name: 'frontend',
          root: './packages/frontend',
          environment: 'jsdom',
          include: ['test/**/*.{test,spec}.{ts,tsx}', 'test/**/*.steps.tsx'],
        },
      },
      {
        test: {
          name: 'infrastructure',
          root: './infrastructure',
          environment: 'node',
          include: ['test/**/*.{test,spec}.ts'],
        },
      },
    ],
  },
});
