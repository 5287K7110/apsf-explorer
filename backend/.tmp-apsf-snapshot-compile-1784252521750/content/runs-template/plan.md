# Plan

<!-- このファイルは framework/templates/plan.md のひな型を使用している -->
<!-- Planner が goal.md をもとに作成する -->
<!-- プロンプト: framework/agents/planner.md を参照 -->

---

## Goal Readiness Check

<!-- Planner が goal.md の planning readiness を確認する。
     goal review ではなく、planning を阻害する構造的問題の限定チェック。
     goal.md の文体・優先度・目標の再定義はスコープ外。 -->

### チェック実施

| チェック項目 | チェック通過 | 備考 |
|---|---|---|
| スコープ（何を作るか）が 1 つに絞れるか | ○ / ✗ |  |
| plan が依存する前提が goal.md に記載されているか | ○ / ✗ |  |
| Success Criteria が存在し相互矛盾していないか | ○ / ✗ |  |
| blocking 依存関係が明示されているか | ○ / ✗ |  |

### 判定

- [ ] **Proceed** — 問題なし。plan 作成を続ける。
- [ ] **Proceed with assumptions** — 軽微な曖昧さあり。仮定を下記に明記し、plan を続ける。<!-- 仮定は plan.md 末尾の ## Assumptions & Open Questions にも転記すること -->
  - 仮定:
- [ ] **Blocked** — 重大な欠如 / 矛盾あり。plan 作成を中断し Human に差し戻す。
  - 根拠:
  - Human への依頼: goal.md の〔該当箇所〕を〔どう直すべきか〕修正し、PLAN_NEEDED に戻してください。

---

## Problem Structure

-
-

---

## Hypotheses

- H1:
- H2:

---

## Options

### Option A:
- 概要:
- メリット:
- デメリット:

### Option B:
- 概要:
- メリット:
- デメリット:

---

## Selected Approach

**採用**:

**理由**:

---

## External Inputs

<!-- Planner が記入。framework/agents/planner.md の識別基準（カテゴリ A / B / C）に
     照らして外部観察の要否を判定し記載する。
     カテゴリ A: キーワード系（「市場調査」「競合分析」「ベンチマーク」等）
     カテゴリ B: goal.md 記述条件系（Success Criteria が外部基準で定義されている等）
     カテゴリ C: 成果物要件系（Build 成果物に競合比較表・ベンチマーク結果等を含む） -->

### 要否判定

- [ ] 外部観察が必要（カテゴリ A / B / C のいずれかに該当）
  - 該当カテゴリ:
  - 判定根拠:
- [ ] 外部観察不要（内部仮説のみで Build に進む）

### 観察対象（必要な場合のみ記入）

| 観察対象 | 観察の目的 | 担当 | 完了タイミング | 記録先 |
|---|---|---|---|---|
|  |  | Human / AI |  | research-input.md または plan.md 付録 |

<!-- 外部観察が必要と判定した場合:
     framework/templates/research-input.md を
     runs/<run-name>/research-input.md としてコピーして使う -->

### Build 開始前チェック

- [ ] 必要な外部観察がすべて完了している（または不要と確認した）
- [ ] 外部観察結果が `research-input.md` または plan.md 付録に記録されている
- [ ] Builder が外部入力を参照できる状態になっている

---

## Implementation Readiness

<!-- build に進む前に Planner が自己チェックする -->
<!-- 3 項目以下しか ✅ にならない場合は、設計 run を追加することを検討する -->

- [ ] API / data shape が確定している（build 中に新たに設計しない）
- [ ] 変更対象ファイル・箇所を列挙できる
- [ ] 依存順が 3 段階以内で説明できる
- [ ] 既存互換の保持点を 1 文で言える
- [ ] 検証・スモークチェックの観点を build 前に言える

**Open Questions（build 開始前に 0〜1 件であること）**:

- （なければ「なし」と記載）

**readiness 判定**:

- [ ] build に進んでよい（上記 5 項目中 4 項目以上 ✅ かつ Open Questions ≤ 1）
- [ ] 設計 run を追加する（上記条件を満たさない）

> ⚠️ 「設計 run を追加する」を選んだ場合、Builder はこの plan を受領しても build に進んではいけない。

---

## Execution Plan

- [ ] Step 1:
- [ ] Step 2:
- [ ] Step 3:

---

## Assumptions & Open Questions

-
