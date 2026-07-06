# Improve

<!-- review.md を参照して Judge（v0.1 では人間）が作成する -->
<!-- role 境界の正本: framework/responsibility-matrix.md -->

---

## Critical Risk Check

<!-- Decision の前に必ず実施する。
     review.md の Critical / Major リスクを黙殺しないための照合欄。
     （responsibility-matrix.md: "silently skip unresolved critical concerns" は禁止） -->

| review.md の Critical / Major リスク | 対応方針 | 根拠 |
|---|---|---|
| <!-- なければ「なし」と明記 --> | 解消済み / 次 iteration で対応 / 対応しない | |

- [ ] review.md の Critical リスクに未対応のものはない（または対応方針を上表に明記した）

> ⚠️ Critical リスクが未解消のまま「終了」を選ぶ場合は、その理由を Decision に必ず記録すること。

---

## Decision

<!-- このループを続けるか終了するかの判断。判断根拠を 1〜2 文で書く -->

- [ ] **CONTINUE** → 次の iteration へ（再開フェーズ: Plan / Build）
- [ ] **APPROVED** → result.md を書いてループを閉じる（成功）
- [ ] **APPROVED_WITH_MANDATORY_FOLLOWUPS** → result.md に記録し、次 run で必ず以下を実施: <!-- 必須フォローアップ -->
- [ ] **SUSPENDED** → result.md に中断理由を記録して閉じる

**判断根拠**:

---

## Next Iteration Scope

<!-- 「続ける」場合のみ記入。review.md の改善提案をすべてやろうとしない -->

**対応する改善**:
- [ ] <!-- review.md から選択した改善案（Suggested improvements の項目名で書く） -->
- [ ]

**対応しない改善（理由）**:
- <!-- 今回スコープ外にする理由 -->

---

## What to Change

<!-- 具体的に何を変えるか。次の Plan / Build への引き継ぎ -->

- 変更 1:
- 変更 2:

---

## Expected Impact

<!-- この変更によって何が改善されるか。goal.md の Success Criteria との対応で書く -->

---

## Notes

<!-- 次 iteration を担当する Planner / Builder / Critic へのメモ -->
