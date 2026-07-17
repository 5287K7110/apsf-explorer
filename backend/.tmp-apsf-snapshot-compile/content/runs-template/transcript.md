# Transcript

<!--
  二次成果物 — 正式記録ではない
  このファイルは run 完了後（result.md 記入後）に生成する

  ═══════════════════════════════════════════════════════════════
  【定義】
  一次記録（goal.md 〜 result.md）を「役割別の発言形式で再構成した可読化文書」。

  - 逐語ログではない（会話をそのまま保存したものではない）
  - 会話の再現・創作ではない（それっぽい発言を作り上げない）
  - 元ファイルをもとに「何を判断し、何を渡したか」を要約した記録

  正確な情報が必要な場合は、必ず一次記録（goal.md〜result.md）を参照すること。
  ═══════════════════════════════════════════════════════════════

  【引用と要約のルール】
  - 元ファイルの原文を「そのまま」転記する場合のみ > (blockquote) を使う
  - それ以外は通常テキストで書く（要約・再構成・解釈には > を使わない）
  - handoff の内容は要約で書く（引用ブロックにしない）
  ★ 迷ったら引用より要約が安全。根拠が複数ファイルにまたがる場合は必ず要約にする。

  書き方:
  1. 以下のセクションを上から順に埋める
  2. 各セクションの「参照:」に書かれたファイルを開いて内容を参照する
  3. 役割別発言形式（**Role**: テキスト）で事実ベースで記述する
  4. 元ファイルにない情報は書かない。「それっぽい会話」を作り上げない
  5. 簡潔に。1 つの発話ブロックは 3〜5 行が目安

  CLI 補助:
    apsf generate-transcript <run-name>
    参照ファイルの一覧と各セクションの記入ガイドを表示する
-->

---

## Run Overview

**Run**: <!-- run_name -->
**Date**: <!-- goal.md を書いた日 -->
**Case**: <!-- cases/ のケース名 -->
**Topic**: <!-- 問題テーマ -->
**Status**: Completed

<!-- 参照: execution-assignment.md -->
**Planned Assignment** (execution-assignment.md の計画):

| Role | Planned Execution | Planned Tool |
|---|---|---|
| Planner | | |
| JuniorBuilder | | |
| Builder | | |
| Critic | | |
| Judge | human | — |

**Actual Execution** (実際に使ったツール・方法):
<!-- 計画通りなら「計画通り」と書いてよい。変更があれば具体的に記載する。 -->

| Role | Actual Execution | Actual Tool |
|---|---|---|
| Planner | | |
| JuniorBuilder | | |
| Builder | | |
| Critic | | |
| Judge | human | — |

---

## Goal

<!-- 参照: goal.md -->

**Human**:
<!-- Goal Statement を 1 文で要約する -->

*背景*:
<!-- Background の要点を 1〜2 文で -->

*成功基準（要約）*:
<!-- Success Criteria のリストを箇条書きで -->

*Planner へのメモ*:
<!-- Notes セクションの内容があれば -->

---

## Planning

<!-- 参照: plan.md / optional handoff.md（Planner -> JuniorBuilder/Builder） -->

**Planner**:
<!-- plan.md の Problem Structure と Selected Approach を要約する -->
<!-- 例: goal.md を読んで問題を X・Y・Z に分解した。採用アプローチは A。 -->

**Planner から JuniorBuilder / Builder への引き継ぎ要点**:
<!-- handoff.md を使う場合は What Is Decided / What Remains Open / What the Next Role Should Inspect First を要約する -->
<!-- 要約テキストで書く。引用ブロック（>）は使わない。 -->
<!-- 例: 変数形式・トーン・カテゴリ分類を決定した。ハッシュタグ戦略は未解決のまま Builder に委ねた。 -->

---

## Draft Generation

<!-- 参照: workspaces/junior_builder/draft-*.md / optional handoff.md（JuniorBuilder -> Builder） -->
<!-- JuniorBuilder を使わなかった場合は「JuniorBuilder: 該当なし（このフェーズをスキップ）」と書く -->

**JuniorBuilder**:
<!-- 何パターンのドラフトを生成したか、どんな内容だったか -->
<!-- 例: plan.md のカテゴリ A〜E に沿って 8 パターンのドラフトを速度優先で生成した。 -->

**JuniorBuilder から Builder への引き継ぎ要点**:
<!-- 何を Builder に渡したか、何を未解決として残したかを要約する -->
<!-- 引用ブロック（>）は使わない。要約テキストで書く。 -->

---

## Build

<!-- 参照: build.md / optional handoff.md（Builder -> Critic） -->

**Builder**:
<!-- build.md の What was built / Decisions made を要約する -->
<!-- 例: JuniorBuilder ドラフトをベースに 9 本の完成版テンプレートを作成した。 -->

**Builder から Critic への引き継ぎ要点**:
<!-- 何を Critic に評価してほしいか、何が未解決かを要約する -->
<!-- 引用ブロック（>）は使わない。要約テキストで書く。 -->

---

## Review

<!-- 参照: review.md / optional handoff.md（Critic -> Judge） -->

**Critic**:
<!-- review.md の Summary と Risks（Critical/Major/Minor）を要約する -->
<!-- 例: 成功基準 5 項目すべて充足。Critical/Major なし。Minor 3 点を指摘した。 -->

**Critic から Judge への引き継ぎ要点**:
<!-- 採用推奨 / 修正後採用 / 却下 のどちらを推奨したか、理由を要約する -->
<!-- 引用ブロック（>）は使わない。要約テキストで書く。 -->

---

## Judge Decision

<!-- 参照: improve.md -->

**Judge**:
<!-- improve.md の Decision と判断理由を要約する -->
<!-- 例: 採用。Minor 3 点は次 run で対応する。 -->

判断: **<!-- 採用 / 修正後採用 / 却下 -->**

*次 iteration スコープ*:
<!-- improve.md の Next Iteration Scope から主要項目を抜粋する -->

---

## Result

<!-- 参照: result.md -->

**Human**:
<!-- result.md の Outcome を 1〜2 文で要約する -->

*成功基準の充足*:
<!-- result.md の Success/Failure テーブルを要約する（全 OK / 一部 OK など） -->

*総合判定*: <!-- 成功 / 部分成功 / 失敗 / 中断 -->

---

## Generalization Notes

<!-- 参照: result.md の Generalization セクション -->
<!-- 原文は result.md を参照すること。ここには要点のみ抜粋する -->

<!-- 例: -->
<!-- - 目的カテゴリを先に分類すると生成物の網羅性が上がる（他のコンテンツ生成 run に転用可能） -->
<!-- - {{変数}} プレースホルダーはテンプレートとインスタンスを分けるパターンとして汎用的 -->

---

## Framework Notes

<!-- 参照: result.md の Framework Feedback セクション -->
<!-- フレームワーク自体への改善提案・気づきを要約する -->

---

*このファイルは二次成果物です。正確な情報は各 .md ファイルを参照してください。*
*参照元: execution-assignment.md / goal.md / plan.md / handoff.md / build.md / review.md / improve.md / result.md*
