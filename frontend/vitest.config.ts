import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only run tests inside the `src` folder to avoid executing
    // test files bundled with dependencies in node_modules.
    include: ['src/**/*.{test,spec}.{ts,tsx,js,jsx}'],
    exclude: ['**/e2e/**', 'node_modules/**'],
    // Use a DOM-like environment so `document` / `window` exist.
    environment: 'happy-dom',
    // Enable Jest-style globals like describe/it
    globals: true,
    // Load test setup (register jest-dom matchers etc.)
    setupFiles: ['src/test/setup.ts'],
  }
});
