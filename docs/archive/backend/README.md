# APSF Explorer Backend

AI を代替可能なコンポーネント化するバックエンド実装

## 思想

```
AI Provider は交換可能なコンポーネント
├─ Claude ↔ Codex を無缝切り替え
├─ 新しい LLM が出たら Provider 追加するだけ
└─ コアロジックは変わらない（SOLID原則）
```

## プロジェクト構造

```
backend/
├── src/
│   ├── index.ts                      # メインサーバー
│   ├── types/
│   │   └── index.ts                  # 型定義（Provider、Request、Response）
│   ├── services/
│   │   └── apsf-bridge.service.ts    # APSF Framework 連携層
│   ├── routes/
│   │   └── runs.route.ts             # API エンドポイント
│   ├── middleware/
│   │   └── auth.middleware.ts        # JWT 認証
│   └── websocket/
│       └── execution-handler.ts      # リアルタイム進捗配信
├── __tests__/
│   └── apsf-bridge.test.ts           # ユニットテスト
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .env                              # 環境変数
└── .gitignore
```

## セットアップ

### 1. 依存関係のインストール

```bash
cd backend
npm install
```

### 2. 環境変数を設定

`.env` ファイルを編集して、API キーを設定：

```env
# Server
PORT=3001
NODE_ENV=development

# Provider (claude | codex | gemini)
APSF_PROVIDER=claude

# API Keys
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...

# APSF Framework
APSF_CLI_PATH=/path/to/apsf
APSF_PYTHON_PATH=python

# JWT
JWT_SECRET=your-secret-key-change-in-production
```

### 3. Development モードで起動

```bash
npm run dev
```

サーバーが `http://localhost:3001` で起動します。

```
✅ APSF Explorer Backend listening on port 3001
🔌 WebSocket ready at ws://localhost:3001
💡 Provider: claude
```

## API エンドポイント

### Health Check

```bash
GET /health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-07-04T00:00:00.000Z"
}
```

### 実行を開始

```bash
POST /api/runs/:id/execute
Authorization: Bearer <JWT_TOKEN>

{
  "command": "plan",
  "provider": "claude",
  "roles": ["planner", "builder"],
  "goal": "Solve the problem",
  "context": {}
}
```

Response:
```json
{
  "runId": "run-123",
  "status": "executing",
  "provider": "claude",
  "message": "Executing plan with claude"
}
```

### 実行をキャンセル

```bash
POST /api/runs/:id/cancel
Authorization: Bearer <JWT_TOKEN>
```

Response:
```json
{
  "runId": "run-123",
  "status": "cancelled"
}
```

### 利用可能な Provider を取得

```bash
GET /api/runs/providers
Authorization: Bearer <JWT_TOKEN>
```

Response:
```json
{
  "providers": ["claude", "codex"],
  "count": 2
}
```

## WebSocket 通信

リアルタイムで実行進捗を受信します。

### 接続

```javascript
const ws = new WebSocket('ws://localhost:3001');

ws.onopen = () => {
  // 実行を開始
  ws.send(JSON.stringify({
    type: 'execute',
    payload: {
      runId: 'run-123',
      command: 'plan',
      provider: 'claude',
      roles: ['planner'],
      goal: 'Solve the problem'
    }
  }));
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Progress:', message);
};
```

### メッセージフォーマット

実行開始：
```json
{
  "type": "execution-start",
  "runId": "run-123",
  "provider": "claude",
  "command": "plan"
}
```

進捗：
```json
{
  "type": "progress",
  "runId": "run-123",
  "timestamp": 1234567890,
  "data": {
    "phase": "planning",
    "progress": 50,
    "agentsUsed": ["planner"]
  }
}
```

完了：
```json
{
  "type": "complete",
  "runId": "run-123",
  "timestamp": 1234567890,
  "data": {
    "provider": "claude",
    "agentsUsed": ["planner", "builder"],
    "exitCode": 0
  }
}
```

エラー：
```json
{
  "type": "error",
  "runId": "run-123",
  "timestamp": 1234567890,
  "data": {
    "error": "API key for claude is empty"
  }
}
```

## テスト

### ユニットテストを実行

```bash
npm run test:run
```

### カバレッジレポート

```bash
npm run test:coverage
```

テストカバレッジレポートが `coverage/` ディレクトリに生成されます。

## ビルド

### TypeScript をコンパイル

```bash
npm run build
```

`dist/` ディレクトリに JavaScript ファイルが生成されます。

### Production モードで起動

```bash
npm start
```

## Provider 実装

### 現在対応している Provider

1. **Claude** (Anthropic)
   - 最新の大規模言語モデル
   - 高品質の推論
   - マッピング: `claude` → `anthropic`

2. **Codex** (OpenAI)
   - コード生成に最適化
   - マッピング: `codex` → `openai`

3. **Gemini** (Google)
   - マルチモーダル対応
   - マッピング: `gemini` → `gemini`

### 新しい Provider を追加する方法

1. `src/types/index.ts` に Provider 型を追加：

```typescript
export type ProviderType = 'claude' | 'codex' | 'gemini' | 'new-provider';
```

2. `src/services/apsf-bridge.service.ts` の `mapProviderToAPSF()` にマッピングを追加：

```typescript
private mapProviderToAPSF(provider: string): string {
  const mapping: Record<string, string> = {
    claude: 'anthropic',
    codex: 'openai',
    gemini: 'gemini',
    'new-provider': 'new-provider-name',  // ← ここに追加
  };
  return mapping[provider] || provider;
}
```

3. `.env` に API キーを追加：

```env
NEW_PROVIDER_API_KEY=sk-...
```

4. `apsf-bridge.service.ts` の `apiKeys` オブジェクトにキーを追加：

```typescript
this.apiKeys = {
  anthropic: process.env.ANTHROPIC_API_KEY || '',
  openai: process.env.OPENAI_API_KEY || '',
  gemini: process.env.GEMINI_API_KEY || '',
  'new-provider': process.env.NEW_PROVIDER_API_KEY || '',  // ← ここに追加
};
```

これで新しい Provider が自動的に使用可能になります！

## 主要なクラス

### APSFBridgeService

APSF Framework との通信層。Provider を抽象化し、AI モデルを交換可能にします。

**メソッド：**
- `execute(request: ExecuteRequest)` - 実行を開始
- `cancelExecution(runId: string)` - 実行をキャンセル
- `isProviderAvailable(provider: string)` - Provider が利用可能か確認
- `getAvailableProviders()` - 利用可能な Provider リストを取得

### ExecutionHandler

WebSocket を介して実行進捗をリアルタイム配信します。

**メソッド：**
- `handleConnection(socket: WebSocket)` - WebSocket 接続を処理
- `handleExecute(socket, request)` - 実行リクエストを処理
- `handleCancel(runId)` - キャンセルリクエストを処理

## エラーハンドリング

### 一般的なエラー

1. **API キーが見つからない**
   ```
   Error: Missing API key for provider: claude
   ```
   解決方法：`.env` ファイルに `ANTHROPIC_API_KEY` を設定

2. **API キーが空**
   ```
   Error: API key for claude is empty. Set ANTHROPIC_API_KEY
   ```
   解決方法：`.env` ファイルに有効な API キーを入力

3. **Provider が利用できない**
   ```
   400 Bad Request: Provider claude is not available
   ```
   解決方法：API キーが設定されているか確認

4. **JWT トークンがない**
   ```
   401 Unauthorized: No token provided
   ```
   解決方法：`Authorization: Bearer <TOKEN>` ヘッダーを含める

5. **JWT トークンが無効**
   ```
   403 Forbidden: Invalid token
   ```
   解決方法：有効なトークンを使用

## ログ出力

サーバーは以下のログを出力します：

```
✅ APSF Explorer Backend listening on port 3001
🔌 WebSocket ready at ws://localhost:3001
💡 Provider: claude
Client connected
Executing plan with claude
Process exited with code 0
Client disconnected
```

## トラブルシューティング

### サーバーが起動しない

```bash
# ポート 3001 が既に使用されているか確認
lsof -i :3001

# または別のポートを使用
PORT=3002 npm run dev
```

### WebSocket に接続できない

1. サーバーが起動しているか確認：
   ```bash
   curl http://localhost:3001/health
   ```

2. WebSocket URL が正しいか確認：
   ```
   ws://localhost:3001 (development)
   wss://your-domain.com (production)
   ```

### Provider が利用できない

```bash
# 利用可能な Provider を確認
curl -H "Authorization: Bearer <TOKEN>" \
  http://localhost:3001/api/runs/providers
```

## License

MIT
