# APSF Explorer Backend - Quick Start Guide

## 1分でセットアップ開始

### Step 1: 依存関係をインストール

```bash
cd backend
npm install
```

**期待時間:** 2-3 分

### Step 2: 環境変数を設定

`.env` ファイルを開いて、あなたの API キーを入力：

```env
# 1. Anthropic Claude API キーを設定（必須）
ANTHROPIC_API_KEY=sk-ant-v0-...

# 2. OpenAI Codex API キーを設定（オプション）
OPENAI_API_KEY=sk-...

# 3. Google Gemini API キーを設定（オプション）
GEMINI_API_KEY=...

# その他の設定はデフォルトで OK です
```

### Step 3: Development サーバーを起動

```bash
npm run dev
```

次のメッセージが表示されたら成功です：

```
✅ APSF Explorer Backend listening on port 3001
🔌 WebSocket ready at ws://localhost:3001
💡 Provider: claude
```

### Step 4: ヘルスチェック

別のターミナルで：

```bash
curl http://localhost:3001/health
```

応答：

```json
{
  "status": "ok",
  "timestamp": "2024-07-04T12:00:00.000Z"
}
```

## 次のステップ

### テストを実行

```bash
npm run test:run
```

### WebSocket でリアルタイム実行

```javascript
// test-websocket.js
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3001');

ws.on('open', () => {
  console.log('Connected to server');
  
  ws.send(JSON.stringify({
    type: 'execute',
    payload: {
      runId: 'test-run-1',
      command: 'plan',
      provider: 'claude',
      roles: ['planner'],
      goal: 'Test execution'
    }
  }));
});

ws.on('message', (data) => {
  console.log('Received:', JSON.parse(data));
});

ws.on('close', () => {
  console.log('Disconnected from server');
});
```

実行：

```bash
node test-websocket.js
```

## トラブルシューティング

### エラー: "Cannot find module 'express'"

```bash
npm install
```

### エラー: "API key for claude is empty"

`.env` ファイルに有効な `ANTHROPIC_API_KEY` を設定してください。

### エラー: "Port 3001 is already in use"

別のポートを使用：

```bash
PORT=3002 npm run dev
```

## ファイル構成

```
backend/
├── src/
│   ├── index.ts                 # サーバーメイン
│   ├── types/                   # 型定義
│   ├── services/                # ビジネスロジック
│   ├── routes/                  # API エンドポイント
│   ├── middleware/              # 認証・ロギングなど
│   └── websocket/               # リアルタイム通信
├── __tests__/                   # テスト
├── package.json                 # 依存関係
├── tsconfig.json                # TypeScript 設定
├── .env                         # 環境変数（秘密）
└── README.md                    # 詳細ドキュメント
```

## API リファレンス

### Health Check

```bash
curl http://localhost:3001/health
```

### Provider 一覧を取得

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3001/api/runs/providers
```

### 実行を開始

```bash
curl -X POST http://localhost:3001/api/runs/run-1/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "command": "plan",
    "provider": "claude",
    "roles": ["planner"],
    "goal": "Solve a problem"
  }'
```

## 次のフェーズ

1. **Frontend 統合** - React UI を接続
2. **Database** - 実行結果を永続化
3. **Authentication** - JWT ベースの認証
4. **Monitoring** - ログ・メトリクス追跡
5. **Deployment** - Docker + Kubernetes

詳細は [README.md](./README.md) を参照。
