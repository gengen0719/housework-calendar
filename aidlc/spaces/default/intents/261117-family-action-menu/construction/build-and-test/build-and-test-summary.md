# ビルド・テスト確認

ビルドと自動テストは成功。既存依存と設定を利用し、新規11シナリオと既存回帰を実行した。Minimalのため追加の統合・性能・セキュリティ手順ファイルは生成しない。操作テストはjsdom、その他単体テストは既存Vitestプロジェクト設定に従う。

## Target Verification Matrix

| Target ID | Source | Expected | Actual | Evidence | Owning Stage | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| FR1-FR4 | requirements.md | 指定操作と既存条件を維持 | 新規11件・関連267件成功 | test-results.md | build-and-test | Met |
| NFR1-keyboard | requirements.md NFR1 | 開閉・選択・Escape・フォーカス | jsdomの操作テスト成功 | CalendarPage.test.tsx、test-results.md | build-and-test | Met |
| NFR1-browser | requirements.md NFR1 | 320pxと長い名前で操作可能 | 折り返し実装済み、実ブラウザー未実行 | code-summary.md、test-results.md | build-and-test | Unverified |
| NFR2-coverage | Testing Contract/team.md | 全体行80%以上 | 96.29% | npm test、coverage/lcov.info | build-and-test | Met |
| NFR2-regression | requirements.md NFR2 | 全体テスト成功 | npm test終了0 | test-results.md | build-and-test | Met |
| NFR2-build | requirements.md NFR2 | lint・型検査・ビルド成功 | すべて終了0 | test-results.md | build-and-test | Met |
| CI-before-merge | Testing Contract | CIで取り込み前に確認 | この計画はCI Pipelineを実行しない | aidlc-state.md | ci-pipeline | N/A |

## Readiness

ローカルのビルド・自動テスト準備は完了。320px実ブラウザー表示はUnverifiedで、全面的な検証成功とは扱わない。ブラウザー未実行だけの不足として承認時に明示する。まだデプロイしていない。

rootのnpm run typecheckには既存のjsx/DOM設定不足がある。CI同様のパッケージ別型検査は実装段階で4パッケージ成功し、この段階では変更対象のfrontendを再検査して成功した。
