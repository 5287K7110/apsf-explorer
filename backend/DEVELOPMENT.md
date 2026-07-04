# APSF Explorer Backend - Development Guide

## 開発環境のセットアップ

### 前提条件

- Node.js 18+ (LTS推奨)
- npm 9+
- Python 3.9+ (APSF Framework 実行用)
- TypeScript の基本知識

### 初期セットアップ

```bash
# 1. backend ディレクトリに移動
cd backend

# 2. 依存関係をインストール
npm install

# 3. 環境変数を設定
cp .env.example .env
# .env を編集して API キーを入力

# 4. 開発サーバーを起動
npm run dev
```

## ファイル構造と責務

```
src/
├── index.ts                      # サーバーメイン（起動点）
│   └─ 役割: Express/WebSocket サーバー初期化
│
├── types/
│   └── index.ts                  # 全グローバル型定義
│       └─ Provider, Request, Response, Event
│
├── services/
│   └── apsf-bridge.service.ts    # コア業務ロジック
│       └─ Role: AI Provider を抽象化
│          - execute() 実行開始
│          - cancelExecution() キャンセル
│          - isProviderAvailable() 確認
│          - Provider マッピング
│
├── routes/
│   └── runs.route.ts             # API エンドポイント
│       └─ Role: HTTP リクエスト処理
│          - POST /api/runs/:id/execute
│          - POST /api/runs/:id/cancel
│          - GET /api/runs/providers
│
├── middleware/
│   └── auth.middleware.ts        # JWT 認証
│       └─ Role: トークン検証
│
└── websocket/
    └── execution-handler.ts      # WebSocket 処理
        └─ Role: リアルタイム通信
           - handleConnection()
           - handleExecute()
           - setupEventListeners()
```

## 開発フロー

### 1. 機能を追加する場合

**例:** 新しい API エンドポイント `/api/runs/:id/logs` を追加

**Step 1:** Type を定義（必要なら）

```typescript
// src/types/index.ts
export interface LogsRequest {
  runId: string;
  startIndex?: number;
  limit?: number;
}

export interface LogsResponse {
  runId: string;
  logs: string[];
  total: number;
}
```

**Step 2:** ルートを追加

```typescript
// src/routes/runs.route.ts
/**
 * GET /api/runs/:id/logs
 * Get execution logs
 */
router.get('/:id/logs', (req: Request, res: Response) => {
  try {
    const runId = req.params.id;
    const { startIndex = 0, limit = 100 } = req.query;

    // TODO: 実装 (現在はモック)
    const logs: LogsResponse = {
      runId,
      logs: [
        '[INFO] Starting execution...',
        '[DEBUG] Initializing providers...',
      ],
      total: 2,
    };

    res.json(logs);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
```

**Step 3:** テストを書く

```typescript
// __tests__/logs.test.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/index.js';

describe('GET /api/runs/:id/logs', () => {
  it('should return logs for a run', async () => {
    const response = await request(app)
      .get('/api/runs/run-1/logs')
      .set('Authorization', 'Bearer test-token')
      .expect(200);

    expect(response.body).toHaveProperty('runId');
    expect(response.body).toHaveProperty('logs');
  });
});
```

### 2. Service を拡張する場合

**例:** Provider のパフォーマンス計測を追加

```typescript
// src/services/apsf-bridge.service.ts
private performanceMetrics: Map<string, PerformanceMetric> = new Map();

async execute(request: ExecuteRequest): Promise<void> {
  const startTime = Date.now();
  const processId = `${request.runId}-${startTime}`;

  try {
    // ... 既存コード ...

    const endTime = Date.now();
    this.performanceMetrics.set(request.runId, {
      duration: endTime - startTime,
      provider: request.provider,
      command: request.command,
    });

  } catch (error) {
    // エラー処理
  }
}

getMetrics(runId: string): PerformanceMetric | undefined {
  return this.performanceMetrics.get(runId);
}
```

### 3. 新しい Provider を追加する場合

**例:** Cohere Provider を追加

**Step 1:** Type と Mapping

```typescript
// src/types/index.ts
export type ProviderType = 'claude' | 'codex' | 'gemini' | 'cohere';

// src/services/apsf-bridge.service.ts
private mapProviderToAPSF(provider: string): string {
  const mapping: Record<string, string> = {
    claude: 'anthropic',
    codex: 'openai',
    gemini: 'gemini',
    cohere: 'cohere',  // ← 追加
  };
  return mapping[provider] || provider;
}

constructor() {
  this.apiKeys = {
    anthropic: process.env.ANTHROPIC_API_KEY || '',
    openai: process.env.OPENAI_API_KEY || '',
    gemini: process.env.GEMINI_API_KEY || '',
    cohere: process.env.COHERE_API_KEY || '',  // ← 追加
  };
}
```

**Step 2:** 環境変数

```env
COHERE_API_KEY=sk-cohere-...
```

**Step 3:** テスト

```typescript
// __tests__/apsf-bridge.test.ts
it('should map cohere provider', () => {
  const result = service['mapProviderToAPSF']('cohere');
  expect(result).toBe('cohere');
});

it('should verify cohere availability', () => {
  process.env.COHERE_API_KEY = 'test-key';
  expect(service.isProviderAvailable('cohere')).toBe(true);
});
```

## コーディングスタイル

### TypeScript の厳格性

すべてのコードは `strict: true` に準拠：

```typescript
// ✅ Good
function processData(data: string | null): string {
  if (!data) return '';
  return data.toUpperCase();
}

// ❌ Bad
function processData(data) {
  return data.toUpperCase();
}
```

### 命名規則

```typescript
// Classes: PascalCase
class APSFBridgeService {}

// Functions: camelCase
function executeCommand() {}

// Constants: UPPER_SNAKE_CASE
const API_KEY = process.env.ANTHROPIC_API_KEY;

// Interfaces: PascalCase (I prefix optional)
interface ExecuteRequest {}

// Types: PascalCase
type ProviderType = 'claude' | 'codex';
```

### コメント規則

```typescript
/**
 * 日本語コメントで機能説明
 * @param request - 実行リクエスト
 * @returns Promise を返す
 * @throws Error API キーが見つからない場合
 */
async execute(request: ExecuteRequest): Promise<void> {
  // 実装
}
```

### エラーハンドリング

```typescript
// ✅ Good
try {
  validateProvider(provider);
} catch (error) {
  if (error instanceof ValidationError) {
    // specific error handling
  }
  throw new Error(`Provider validation failed: ${error}`);
}

// ❌ Bad
try {
  validateProvider(provider);
} catch (error) {
  console.log('error');
}
```

## テスト戦略

### ユニットテスト

```bash
npm run test
```

**テストカバレッジの目標:** 80%+

```typescript
// __tests__/example.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('ClassName', () => {
  let service: ClassName;

  beforeEach(() => {
    // テスト前の準備
    service = new ClassName();
  });

  afterEach(() => {
    // テスト後のクリーンアップ
    vi.clearAllMocks();
  });

  describe('method name', () => {
    it('should do something', () => {
      const result = service.method();
      expect(result).toBe(expectedValue);
    });

    it('should handle errors', () => {
      expect(() => service.method()).toThrow();
    });
  });
});
```

### 統合テスト（将来実装）

```typescript
// __tests__/integration/api.test.ts
import request from 'supertest';
import app from '../../src/index.js';

describe('API Integration', () => {
  it('should execute a plan', async () => {
    const response = await request(app)
      .post('/api/runs/run-1/execute')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        command: 'plan',
        provider: 'claude',
        roles: ['planner'],
      })
      .expect(200);

    expect(response.body.status).toBe('executing');
  });
});
```

## デバッグ方法

### 1. コンソールログ

```typescript
console.log('Debug info:', value);
console.error('Error info:', error);
```

### 2. Node.js Debugger

```bash
# デバッグモードで起動
node --inspect dist/index.js

# Chrome DevTools で chrome://inspect にアクセス
```

### 3. VS Code Debugger

`.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Launch Program",
      "program": "${workspaceFolder}/dist/index.js",
      "preLaunchTask": "tsc: build",
      "outFiles": ["${workspaceFolder}/dist/**/*.js"]
    }
  ]
}
```

### 4. ログレベル

```typescript
// 将来: Logger クラスを実装
enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

class Logger {
  log(level: LogLevel, message: string) {
    if (level >= this.minLevel) {
      console.log(`[${LogLevel[level]}] ${message}`);
    }
  }
}
```

## パフォーマンスプロファイリング

### メモリ使用量

```bash
# Node.js のメモリプロファイル
node --prof dist/index.js
node --prof-process isolate-*.log > profile.txt
```

### CPU プロファイリング

```bash
# Clinic.js を使用
npm install -g clinic
clinic doctor -- node dist/index.js
```

## コミットとPR

### Git ワークフロー

```bash
# 1. 機能ブランチを作成
git checkout -b feature/new-endpoint

# 2. コードを実装
# 3. テストを書く
npm run test:run

# 4. ビルドを確認
npm run build

# 5. コミット
git add .
git commit -m "feat: add new endpoint /api/runs/:id/logs"

# 6. PR を作成
git push origin feature/new-endpoint
```

### コミットメッセージ規則

```
feat: 新機能追加
fix: バグ修正
docs: ドキュメント更新
style: コード整形
refactor: リファクタリング
test: テスト追加・修正
chore: ビルド、依存関係など
```

例：
```
feat: add provider caching mechanism
fix: handle null API key gracefully
docs: update WebSocket API reference
```

## トラブルシューティング

### よくあるエラーと対処

| エラー | 原因 | 対処 |
|--------|------|------|
| `Cannot find module` | 依存関係不足 | `npm install` |
| `Port 3001 already in use` | ポート競合 | `PORT=3002 npm run dev` |
| `EACCES: permission denied` | パーミッション不足 | `sudo npm run dev` |
| `Error: Cannot find APSF_CLI_PATH` | パス設定ミス | `.env` を確認 |
| `API key for claude is empty` | API キー未設定 | `.env` に キーを追加 |

## 本番環境への対応

### Pre-deployment Checklist

- [ ] すべてのテストが通っている
- [ ] コードカバレッジ 80%+
- [ ] TypeScript エラーなし
- [ ] ログレベル設定OK（本番は INFO 以上）
- [ ] API キーが安全に保管されている
- [ ] 環境変数が本番用に設定されている
- [ ] エラーハンドリングが充実している
- [ ] パフォーマンステスト完了

### リリースプロセス

```bash
# 1. バージョンを更新
npm version patch  # 1.0.0 → 1.0.1
npm version minor  # 1.0.0 → 1.1.0
npm version major  # 1.0.0 → 2.0.0

# 2. ビルド
npm run build

# 3. テスト
npm run test:run

# 4. デプロイ
# (deployment script を実行)
```

## リソース

- [Express.js Documentation](https://expressjs.com/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Vitest Documentation](https://vitest.dev/)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [JWT.io](https://jwt.io/)

## 質問やサポート

プロジェクトに関する質問や問題は、GitHub Issues で報告してください。
