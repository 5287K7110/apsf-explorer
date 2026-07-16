// integration テスト専用の vitest 設定（実 backend が起動している前提）。
// scripts/run-frontend-integration-tests.ts が backend を立ててから
// `vitest run --config vitest.integration.config.ts` 相当で使う。
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./frontend/__tests__/setup.ts'],
    include: ['frontend/__tests__/integration/**/*.test.ts'],
    testTimeout: 15000,
    hookTimeout: 15000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './frontend'),
    },
  },
});
