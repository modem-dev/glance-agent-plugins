import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': rootDir,
    },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      include: [
        'lib/**/*.ts',
        'app/[token]/route.ts',
        'app/api/issue/route.ts',
        'app/api/upload/route.ts',
        'app/api/ocr/route.ts',

        'app/api/cron/cleanup/route.ts',

        'app/api/session/**/*.ts',
      ],
      exclude: ['**/*.test.ts'],
      thresholds: {
        lines: 85,
        branches: 80,
        functions: 85,
        statements: 85,
      },
    },
  },
});
