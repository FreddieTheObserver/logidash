import { defineConfig } from 'vitest/config';

export default defineConfig({
  // vitest bundles Vite 7, where @vitejs/plugin-react@6 (built for Vite 8)
  // doesn't apply its JSX transform — so drive the automatic JSX runtime
  // through esbuild directly instead of the plugin.
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
