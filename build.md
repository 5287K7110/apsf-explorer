# Build

## What was built

Run Status タブを実 APSF run に接続した。モックデータ（`runStore` / `generateMockRuns`）への依存を排除し、既存の `/api/runs/apsf` 系エンドポイント経由で実データを表示する読み取り専用ビューに置き換えた。

Build Review の「リファクタリングまで実行すべき」に応じ、Dashboard・Header からモック用 Sidebar と `useRunStore` への依存を除去しアプリシェルをクリーンアップした。

Build Review（2 回目）の「フロントエンドがバックエンドのソースを直接 import しているのは問題」に応じ、`backend/src/services/apsf-native/phases` への越境 import を排除し、フロントエンド内にローカルコピー `frontend/utils/phases.ts` を新設した。

### Files created

| File | Purpose |
|------|---------|
| `frontend/hooks/useRunStatusTab.ts` | Run Status タブ専用フック。`apsfAPI.getRuns()` で run 一覧取得、`apsfAPI.getPhase()` でフェーズ検出、WebSocket `complete`/`error` イベントでライブ更新 |
| `frontend/components/RunStatusView.tsx` | Run Status タブの UI。run セレクタ + フェーズ表示 + 成果物一覧 + エラー/advisory 表示 |
| `frontend/utils/phases.ts` | `isHumanPhase()` のフロントエンドローカルコピー。backend ソースへの越境 import を排除するために新設 |

### Files modified

| File | Change |
|------|--------|
| `frontend/components/Dashboard.tsx` | Run Status タブ内容を `RunStatusView` に差し替え。Demo バッジ除去。`useRunStore` / `Sidebar` import 削除 |
| `frontend/components/Header.tsx` | `useRunStore` 依存除去。サイドバートグルボタン（Menu/X）削除。`onMenuClick` prop 削除 |
| `frontend/components/RunStatusView.tsx` | `isHumanPhase` の import 先を `../../backend/...` → `../utils/phases` に変更 |
| `frontend/components/apsf/PhaseStatusPanel.tsx` | `isHumanPhase` の import 先を `../../../backend/...` → `../../utils/phases` に変更 |

## Inputs received

- Plan: Run Status タブをモックではなく実 APSF run に接続。frontend のみ、backend 変更なし
- Done Criteria: 実 run 選択可、実 phase 表示、Demo バッジ除去、APSF Runs タブ不干渉
- Build Review #1: 「リファクタリングまで実行すべき」— モック依存の残存結合を除去せよ
- Build Review #2: 「フロントエンドがバックエンドのソースを直接 import しているのは問題」— 越境 import を排除せよ

## Decisions made

1. **既存コンポーネント（PhaseIndicator, CommandPanel 等）を再利用しない** — mock 専用の `Run` 型に依存しており、実 APSF データとは形状が合わない。adapter を作るより実データに合った新 view を作る方がシンプル
2. **Run Status は読み取り専用** — 操作（execute, write-phase, judge）は APSF Runs タブに集約。状態確認に特化
3. **Dashboard・Header から `useRunStore` と `Sidebar` を除去**（リファクタリング） — Sidebar はモックデータ専用であり、実 run 接続後は Dashboard に不要
4. **Sidebar コンポーネントは削除せず残置** — Analytics が `useRunStore` 経由でモックデータを使用しており、Analytics タブ廃止時にまとめて削除する方が安全
5. **`isHumanPhase` をフロントエンドにローカルコピー** — shared パッケージは現プロジェクト構成では過剰。定数セットのローカルコピー + ソースコメントで十分。バックエンドの `phases.ts` を source of truth とし、同期はコメントで明示

## Deviations from Plan

- Plan のスコープ（frontend のみ、既存エンドポイント利用、backend 変更なし）を厳守
- Build Review #1 で要求されたリファクタリングとして、Dashboard・Header のモック依存除去を追加実施
- Build Review #2 で指摘された越境 import の排除として、`frontend/utils/phases.ts` を新設

## Open Issues

1. **旧 mock コンポーネント群の完全削除** — Sidebar, Analytics, runStore, useAPI, CommandPanel 等はファイルとして残存。Analytics タブ廃止判断後にまとめて削除可能
2. **Run Status と APSF Runs の将来的統合** — 両タブとも実 run を表示する。Run Status は読み取り専用、APSF Runs はフル操作。ユーザビリティ観点で統合を検討する余地あり
3. **phases.ts の同期** — `frontend/utils/phases.ts` は `backend/src/services/apsf-native/phases.ts` のローカルコピー。APSF フェーズ定義が変更された場合は両方を更新する必要がある
