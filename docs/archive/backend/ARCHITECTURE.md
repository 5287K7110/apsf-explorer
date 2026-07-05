# APSF Explorer Backend - Architecture

## 全体設計図

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React)                        │
│                  (apsf-explorer root)                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     │ HTTP + WebSocket
                     │
┌────────────────────▼────────────────────────────────────────┐
│                Express Server (Port 3001)                    │
│                  (src/index.ts)                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         API Routes (/api/runs)                       │   │
│  │  - POST /api/runs/:id/execute                        │   │
│  │  - POST /api/runs/:id/cancel                         │   │
│  │  - GET  /api/runs/providers                          │   │
│  └──────────────────────────────────────────────────────┘   │
│                        │                                     │
│                        ▼                                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │      ExecutionHandler (WebSocket)                    │   │
│  │  - handleConnection()                                │   │
│  │  - handleExecute()                                   │   │
│  │  - handleCancel()                                    │   │
│  └──────────────────────────────────────────────────────┘   │
│                        │                                     │
│                        ▼                                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │    APSFBridgeService (AI Provider Abstraction)       │   │
│  │                                                      │   │
│  │  ┌──────────────────────────────────────────────┐   │   │
│  │  │  Provider Selection Layer                    │   │   │
│  │  │  - claude   → anthropic                      │   │   │
│  │  │  - codex    → openai                         │   │   │
│  │  │  - gemini   → gemini                         │   │   │
│  │  └──────────────────────────────────────────────┘   │   │
│  │                    │                                 │   │
│  │  ┌────────────────┼────────────────┐               │   │
│  │  ▼                ▼                ▼               │   │
│  │ Claude      OpenAI Codex      Google Gemini      │   │
│  │ (Anthropic)                                      │   │
│  └──────────────────────────────────────────────────┘   │
│                        │                                 │
│                        ▼                                 │
│  ┌──────────────────────────────────────────────────┐   │
│  │     Child Process (APSF CLI)                      │   │
│  │   - spawn(python, [args], env)                    │   │
│  │   - Communicate via stdout/stderr                │   │
│  └──────────────────────────────────────────────────┘   │
│                        │                                 │
└────────────────────────┼─────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────────┐
        │   APSF Framework                   │
        │   (ai-problem-solving-framework)   │
        │                                    │
        │  - Planner Agent                   │
        │  - Builder Agent                   │
        │  - Reviewer Agent                  │
        │  - Judge Agent                     │
        └────────────────────────────────────┘
                         │
        ┌────────────────┴────────────────┐
        │                                 │
        ▼                                 ▼
    LLM Calls                      External APIs
    (with selected Provider)       (GitHub, etc.)
```

## コンポーネント設計

### 1. Entry Point: `src/index.ts`

**責務:**
- Express サーバーの初期化
- CORS・JSON パーサーの設定
- ルートの登録
- WebSocket サーバーの起動
- ポートのリッスン開始

**依存関係:**
```
express
cors
ws (WebSocket)
dotenv
routes/runs.route.ts
websocket/execution-handler.ts
```

**フロー:**
```
1. dotenv.config() → 環境変数をロード
2. express() → Express インスタンス作成
3. http.createServer() → HTTP サーバー作成
4. WebSocket.Server() → WebSocket サーバー作成
5. app.use() → ミドルウェアを登録
6. app.use('/api/runs', runsRoute) → ルートを登録
7. wss.on('connection') → WebSocket 接続を処理
8. server.listen() → ポートでリッスン開始
```

### 2. Types: `src/types/index.ts`

**データモデル:**
- `ProviderType` - プロバイダーの型定義
- `ProviderConfig` - プロバイダーの設定
- `ExecuteRequest` - 実行リクエスト
- `ExecuteResponse` - 実行レスポンス
- `StreamEvent` - WebSocket イベント
- `User` - ユーザー情報
- `JWTPayload` - JWT ペイロード

**パターン:** TypeScript strict mode で全て厳格な型付け

### 3. Service Layer: `src/services/apsf-bridge.service.ts`

**設計パターン:** Strategy Pattern + Adapter Pattern

```
APSFBridgeService
├── Strategy: providerを選択可能
│   ├── claude → anthropic
│   ├── codex → openai
│   └── gemini → gemini
│
├── Adapter: 外部 APSF CLI との通信を抽象化
│   ├── spawn() で子プロセスを実行
│   ├── JSON を解析してイベントを発行
│   └── エラーを適切にハンドル
│
└── EventEmitter: リアルタイムイベント配信
    ├── 'event' - APSF からのイベント
    └── 'error' - エラーイベント
```

**主要メソッド:**

| メソッド | 役割 | 入力 | 出力 |
|---------|------|------|------|
| `execute()` | 実行を開始 | `ExecuteRequest` | `Promise<void>` |
| `cancelExecution()` | 実行をキャンセル | `runId: string` | `void` |
| `isProviderAvailable()` | Provider が使用可能か | `provider: string` | `boolean` |
| `getAvailableProviders()` | 使用可能な Provider リスト | なし | `string[]` |
| `validateProvider()` | API キーを検証 | `provider: string` | `void` |
| `mapProviderToAPSF()` | Provider 名をマップ | `provider: string` | `string` |
| `buildCommandArgs()` | CLI 引数を構築 | `request, provider` | `string[]` |
| `buildEnvironment()` | 環境変数を構築 | `provider: string` | `Record<string, string>` |
| `setupProcessHandlers()` | イベント処理を設定 | `process, request, id` | `void` |

**エラーハンドリング:**

```typescript
try {
  validateProvider(provider);      // 1. API キー確認
  mapProviderToAPSF(provider);     // 2. Provider マップ
  buildCommandArgs();              // 3. 引数構築
  spawn(pythonPath, args);         // 4. プロセス開始
} catch (error) {
  emit('error', StreamEvent);      // エラーイベント発行
}
```

### 4. Routes: `src/routes/runs.route.ts`

**エンドポイント:**

```
POST /api/runs/:id/execute
├─ 認証: authenticateToken
├─ 検証: command, provider 必須
├─ 検証: provider が利用可能か
├─ 実行: APSFBridgeService.execute()
└─ 応答: { runId, status, provider, message }

POST /api/runs/:id/cancel
├─ 認証: authenticateToken
├─ 実行: APSFBridgeService.cancelExecution()
└─ 応答: { runId, status }

GET /api/runs/providers
├─ 認証: authenticateToken
├─ 取得: APSFBridgeService.getAvailableProviders()
└─ 応答: { providers: string[], count: number }
```

### 5. Middleware: `src/middleware/auth.middleware.ts`

**JWT 認証フロー:**

```
Request Header
    │
    ├─ Authorization: Bearer <TOKEN>
    │
    ▼
Extract Token
    │
    ├─ Split by ' ' → get token
    │
    ▼
Verify Token
    │
    ├─ jwt.verify(token, JWT_SECRET)
    │
    ├─ Success → req.userId = decoded.userId
    │
    ├─ next() → Controller に進む
    │
    └─ Error → res.status(403).json({ error })
```

**エラーレスポンス:**

| エラー | ステータス | メッセージ |
|--------|-----------|-----------|
| No token | 401 | No token provided |
| Invalid token | 403 | Invalid token |

### 6. WebSocket Handler: `src/websocket/execution-handler.ts`

**接続フロー:**

```
Client connects
    │
    ▼
handleConnection()
    │
    ├─ connectionId 生成
    ├─ socket.on('message') → 受信処理
    ├─ socket.on('close') → 切断処理
    └─ activeConnections に登録
    │
    ▼
Message Handling
    │
    ├─ type: 'execute' → handleExecute()
    │   ├─ Validation
    │   ├─ APSF 実行開始
    │   └─ execution-start イベント送信
    │
    └─ type: 'cancel' → handleCancel()
        └─ 実行をキャンセル
    │
    ▼
Event Broadcasting
    │
    ├─ APSF から 'event' 受信
    ├─ JSON に変換
    └─ activeConnections の全クライアントに送信
```

**メッセージフォーマット:**

```json
// クライアント → サーバー
{
  "type": "execute" | "cancel",
  "payload": ExecuteRequest
}

// サーバー → クライアント
{
  "type": "progress" | "complete" | "error" | "log",
  "runId": string,
  "timestamp": number,
  "data": Record<string, unknown>
}
```

## Provider 追加手順

### 新しい Provider を追加する場合：

**Step 1:** Type を追加

```typescript
// src/types/index.ts
export type ProviderType = 'claude' | 'codex' | 'gemini' | 'llama';  // ← 追加
```

**Step 2:** Mapping を追加

```typescript
// src/services/apsf-bridge.service.ts
private mapProviderToAPSF(provider: string): string {
  const mapping: Record<string, string> = {
    claude: 'anthropic',
    codex: 'openai',
    gemini: 'gemini',
    llama: 'llama',  // ← 追加
  };
  return mapping[provider] || provider;
}
```

**Step 3:** API キーを追加

```typescript
// src/services/apsf-bridge.service.ts
constructor() {
  this.apiKeys = {
    anthropic: process.env.ANTHROPIC_API_KEY || '',
    openai: process.env.OPENAI_API_KEY || '',
    gemini: process.env.GEMINI_API_KEY || '',
    llama: process.env.LLAMA_API_KEY || '',  // ← 追加
  };
}
```

**Step 4:** 環境変数を追加

```env
LLAMA_API_KEY=sk-...
```

**これで自動的に使用可能になります！** ➜ コア変更なし

## データフロー

### 実行フロー

```
Frontend
    │ WebSocket message
    │ { type: 'execute', payload: ExecuteRequest }
    │
    ▼
ExecutionHandler.handleConnection()
    │
    ▼
handleExecute()
    │
    ├─ Validation
    │
    ▼
APSFBridgeService.execute()
    │
    ├─ validateProvider() → API キー確認
    ├─ mapProviderToAPSF() → Provider マッピング
    ├─ buildCommandArgs() → CLI 引数構築
    ├─ buildEnvironment() → 環境変数構築
    ├─ spawn() → プロセス起動
    │
    ▼
Child Process (python -m apsf.cli)
    │
    ├─ APSF Framework 実行
    ├─ 選択した Provider でエージェント実行
    │
    ├─ stdout: JSON イベント
    ├─ stderr: エラーログ
    │
    ▼
Process Event Handlers
    │
    ├─ stdout: StreamEvent 発行
    ├─ stderr: error StreamEvent 発行
    ├─ close: complete/error StreamEvent 発行
    │
    ▼
EventEmitter ('event' イベント)
    │
    ▼
ExecutionHandler (event リスナー)
    │
    ▼
WebSocket Broadcasting
    │
    ├─ 全接続クライアントに broadcast
    │
    ▼
Frontend
    │
    └─ UI 更新 → ユーザーに表示
```

## エラーハンドリング

### エラーパイプライン

```
                     Error Occurred
                          │
                ┌─────────┴─────────┐
                │                   │
            Sync Error          Async Error
                │                   │
                ▼                   ▼
         try/catch block      event listener
                │                   │
                ▼                   ▼
          emit('error')        emit('event', type: 'error')
                │                   │
                └─────────┬─────────┘
                          │
                          ▼
            ExecutionHandler broadcasts
                          │
                          ▼
                WebSocket clients receive
                          │
                          ▼
                     Frontend displays
```

### エラーの種類

| エラー | 原因 | 対処 | ステータス |
|--------|------|------|-----------|
| `validateProvider` | API キー不足 | .env を確認 | 500 |
| `spawn` | プロセス起動失敗 | APSF CLI パス確認 | 500 |
| `JSON.parse` | 出力が JSON でない | ログメッセージとして処理 | OK |
| `close (code != 0)` | APSF 実行失敗 | ログを確認 | error event |
| `JWT verify` | トークン無効 | 再認証 | 403 |

## パフォーマンス

### 最適化ポイント

1. **イベント駆動型** - 同期処理を避ける
2. **ストリーミング** - リアルタイム配信
3. **マルチプロセス** - 複数実行を同時処理
4. **キャッシング** - Provider リストをキャッシュ可能

### スケーリング戦略

```
Phase 1: Single Server (現在)
    └─ 複数 WebSocket 接続 ✓

Phase 2: Load Balancer
    ├─ Redis で接続情報共有
    └─ 複数 Backend インスタンス

Phase 3: Message Queue
    ├─ RabbitMQ / Kafka
    ├─ 非同期実行管理
    └─ ジョブ永続化
```

## セキュリティ

### 実装済み

- [x] JWT 認証 (routes に適用)
- [x] API キー環境変数管理
- [x] 入力検証 (command, provider)
- [x] エラーメッセージのサニタイズ

### TODO

- [ ] Rate limiting
- [ ] CORS whitelist
- [ ] Input validation (goal, context)
- [ ] Logging/Monitoring
- [ ] API key rotation
- [ ] TLS/SSL (production)

## Testing

### テスト戦略

```
Unit Tests (ユニットテスト)
    ├─ APSFBridgeService
    │   ├─ validateProvider()
    │   ├─ mapProviderToAPSF()
    │   ├─ buildCommandArgs()
    │   └─ buildEnvironment()
    │
    └─ Middleware
        └─ authenticateToken()

Integration Tests (統合テスト)
    ├─ /api/runs/:id/execute
    ├─ /api/runs/:id/cancel
    └─ WebSocket execution

E2E Tests (E2E テスト)
    ├─ Frontend ↔ Backend
    └─ APSF Framework 連携
```

現在は Unit Tests のみ実装。

## デプロイメント

### 本番環境への対応

```yaml
Development:
  PORT: 3001
  NODE_ENV: development
  CORS: '*'
  
Staging:
  PORT: 3001
  NODE_ENV: staging
  CORS: restricted
  
Production:
  PORT: 80 / 443
  NODE_ENV: production
  CORS: specific domain only
  JWT_SECRET: strong secret
  API keys: secure vault
```

詳細は DEPLOYMENT.md を参照（別途作成予定）。
