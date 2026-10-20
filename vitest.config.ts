import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{apps,packages}/*/{src,test}/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', 'apps/web/e2e/**'],
    testTimeout: 15_000,
  },
});
