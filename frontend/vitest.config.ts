import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only run tests inside the `src` folder to avoid executing
    // test files bundled with dependencies in node_modules.
    include: ['src/**/*.{test,spec}.{ts,tsx,js,jsx}'],
    exclude: ['**/e2e/**', 'node_modules/**'],
    // Use jsdom environment for better compatibility with jest-dom
    environment: 'jsdom',
    // Prefer explicit imports for test helpers (avoid global collisions)
    globals: false,
    // Load test setup (register jest-dom matchers etc.)
    setupFiles: ['src/test/setup.ts'],
  }
});
