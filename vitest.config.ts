import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    // この config は frontend unit テスト専用。
    // - backend/__tests__ は node 環境前提（jsdom では動かない）— backend 側で実行する
    // - integration テストは実 backend が必要（npm run test:integration で実行）
    include: ['frontend/__tests__/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', 'frontend/__tests__/integration/**'],
    setupFiles: ['./frontend/__tests__/setup.ts'],
    testTimeout: 10000, // 10 seconds for integration tests
    hookTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'frontend/__tests__/',
        '**/*.d.ts',
        '**/index.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './frontend'),
    },
  },
});
