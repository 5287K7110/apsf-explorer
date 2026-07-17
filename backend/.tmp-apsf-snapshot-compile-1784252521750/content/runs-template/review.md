# Review

<!-- build.md + 成果物 をもとに Critic が作成する。handoff.md は存在する場合だけ追加 transfer context として参照する -->
<!-- Builder と異なるモデル・視点で評価すること -->

---

## Summary of review

<!-- 全体的な評価（1〜2 文）と、Goal の成功基準をどの程度達成できているかの概観 -->

---

## Plan Readiness Review

<!-- plan.md の Implementation Readiness セクションを Critic が検証する -->
<!-- build.md の内容と照合し、plan 時点の readiness 申告が妥当だったかを評価する -->

| 観点 | plan 時点の申告 | build 後の実態 | 判定 |
|---|---|---|---|
| API / data shape 確定 | ✅ / ❌ | （build で設計変更があったか） | ○ / △ / × |
| 変更対象の列挙 | ✅ / ❌ | （漏れ・追加があったか） | ○ / △ / × |
| 依存順の明確さ | ✅ / ❌ | （build 中に分岐が増えたか） | ○ / △ / × |
| 互換保持点 | ✅ / ❌ | （互換判断を build 中にしたか） | ○ / △ / × |
| 検証観点の具体化 | ✅ / ❌ | （想定外の確認作業があったか） | ○ / △ / × |

**総合判定**:
- ○ plan の readiness は適切だった
- △ 一部 plan の精度が足りなかった（次回の改善点として記録）
- × plan が不十分だった（Improve で plan を再設計することを推奨）

> △ / × の場合、review の総合判定は原則 Improve 行きとする。Accept にする場合は理由を明記すること。

---

## Critical Issues

<!-- このまま進めるべきでない問題。必ず次 iteration で対処が必要 -->

- なし

---

## Major Issues

<!-- 重要だが blocking ではない問題。次 iteration での対処を推奨 -->

- なし

---

## Minor Issues

<!-- できれば対処したい問題。優先度は低い -->

- なし

---

## Suggested Improvements

<!-- 優先度付きの改善提案。「何を、どのように変えるか」を具体的に -->

- [ ] [Critical]
- [ ] [Major]
- [ ] [Minor]

---

## Notes

<!-- スコープ外の気づき・将来的な検討事項（参考情報として分離） -->

---

```apsf-judge-advisory
{"recommendation": "Accept", "human_owned_blocker": false}
```
