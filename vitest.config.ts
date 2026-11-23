import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['monitor.test.js', 'opencli.test.js', 'src/**/*.test.{ts,tsx}'],
    environment: 'node',
    environmentMatchGlobs: [['src/renderer/**/*.test.tsx', 'jsdom']],
    setupFiles: ['./src/renderer/test-setup.ts'],
    restoreMocks: true,
  },
});
