# Integration Test Guide

## Overview

APSF Explorer v1.0 統合テストスイート。Frontend ↔ Backend ↔ CLI 統合を自動検証します。

## 前提条件

✅ **npm install は済ませてください** (バックエンド・フロントエンド共に)

### セットアップ手順

```bash
# Backend のセットアップ
cd backend
npm install

# Frontend のセットアップ (必要に応じて)
cd ../frontend
npm install
```

テストスクリプトは npm install をスキップして、すぐにテスト実行を開始します。

---

## クイックスタート

### Linux / macOS

```bash
cd /path/to/apsf-explorer
bash run-integration-tests.sh
```

### Windows (PowerShell)

```powershell
cd C:\Users\PC_User\PRJ\apsf-explorer
.\run-integration-tests.ps1
```

---

## 9つの統合テスト

| # | テスト | 説明 | 期待時間 |
|---|--------|------|---------|
| 1 | WebSocket Connection | サーバーへの接続確認 | ~50ms |
| 2 | CLI-FULL Mode | Artifact 保存付き実行 | ~500ms |
| 3 | CLI-LITE Mode | 軽量実行（Artifact なし） | ~500ms |
| 4 | Claude Provider | Claude プロバイダー統合 | ~500ms |
| 5 | Codex Provider | Codex プロバイダー統合 | ~500ms |
| 6 | Error Handling | エラー処理の検証 | ~200ms |
| 7 | Artifact Saving | Artifact の保存確認 | ~500ms |
| 8 | Event Streaming | イベントストリーミング | ~500ms |
| 9 | Concurrent Requests | 並列リクエスト（3個） | ~1200ms |

**合計実行時間**: 5～6秒

---

## テスト実行結果の見方

### ✅ PASS の場合

```
╔════════════════════════════════════════════════════╗
║  APSF Explorer - Integration Test Suite           ║
║  Frontend ↔ Backend ↔ CLI                         ║
╚════════════════════════════════════════════════════╝

📦 Starting Backend Server...
✅ Backend running (PID: 12345)

🧪 Running Integration Tests...

✅ Test 1/9: WebSocket Connection - PASS (45ms)
✅ Test 2/9: CLI-FULL Mode - PASS (523ms)
✅ Test 3/9: CLI-LITE Mode - PASS (487ms)
✅ Test 4/9: Claude Provider - PASS (510ms)
✅ Test 5/9: Codex Provider - PASS (502ms)
✅ Test 6/9: Error Handling - PASS (123ms)
✅ Test 7/9: Artifact Saving - PASS (501ms)
✅ Test 8/9: Event Streaming - PASS (534ms)
✅ Test 9/9: Concurrent Requests - PASS (1245ms)

============================================================
📊 INTEGRATION TEST RESULTS
============================================================

PASSED: 9/9
FAILED: 0/9
TOTAL TIME: 5380ms
============================================================

🎉 ALL TESTS PASSED! 🎉
```

### ❌ FAIL の場合

詳細メッセージで何が失敗したかを確認します。

```
❌ Test 2/9: CLI-FULL Mode - FAIL
Message: Connection timeout
```

---

## トラブルシューティング

### Backend が起動できない

```bash
cd backend
npm run dev
```

で直接起動し、エラーメッセージを確認してください。

```bash
cat backend.log  # (Bash の場合)
Get-Content backend.log  # (PowerShell の場合)
```

### WebSocket 接続エラー

Backend が正しく起動しているか確認：

```bash
lsof -i :3001  # (macOS/Linux)
netstat -ano | findstr :3001  # (Windows)
```

### TypeScript コンパイルエラー

```bash
cd backend
npx tsc --noEmit
```

### npx tsx が見つからない

```bash
cd backend
npm install --save-dev tsx
```

---

## CI/CD 統合

### GitHub Actions の例

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          cd backend && npm install
          cd ../frontend && npm install
      
      - name: Run integration tests
        run: bash run-integration-tests.sh
```

### GitLab CI の例

```yaml
integration-tests:
  image: node:18
  script:
    - cd backend && npm install
    - cd ../frontend && npm install
    - cd .. && bash run-integration-tests.sh
  only:
    - merge_requests
    - main
```

---

## 開発時のデバッグ

### 個別テスト実行

特定テストだけを実行したい場合：

```bash
cd backend
npx tsx run-integration-tests.ts
```

を実行後、コード内の該当テストメソッドをコメントアウト。

### ログの詳細出力

```bash
# Backend ログを表示
tail -f backend.log

# 別ターミナルでテスト実行
bash run-integration-tests.sh
```

### WebSocket デバッグ

テスト実行中に wscat でメッセージを監視：

```bash
npm install -g wscat
wscat -c ws://localhost:3001
```

---

## 本番環境への展開

1. ✅ `npm install` を実行 (dependencies 確認)
2. ✅ `bash run-integration-tests.sh` で統合テスト合格
3. ✅ Frontend build: `npm run build`
4. ✅ Backend build: `npm run build`
5. ✅ 本番環境へデプロイ

---

## サポート

テスト失敗時は以下を確認：

- [ ] Node.js v18 以上がインストール済み
- [ ] Backend と Frontend の `npm install` が完了
- [ ] ポート 3001 が使用可能
- [ ] ファイアウォール設定確認

質問は GitHub Issues にお願いします。
