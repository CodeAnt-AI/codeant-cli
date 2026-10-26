import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      ...configDefaults.exclude,
      ...(process.env.CODEANT_LIVE_TESTS === '1' ? [] : ['tests/scans/**', 'tests/settings/**']),
    ],
  },
});
