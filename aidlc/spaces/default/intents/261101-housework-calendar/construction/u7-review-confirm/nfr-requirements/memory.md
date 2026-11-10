# 観察日記（memory）— U7 確認・修正と確定 / NFR Requirements

このステージ（`nfr-requirements`、unit: `u7-review-confirm`、depth: Standard）で気づいたことを残す。

## 読んだもの
- ステージ定義 `nfr-requirements.md`、構築フェーズのルール `phases/construction.md`、`org/team/project.md`
- U7 の機能設計（`functional-spec.md`、`rules.md` BR8.1〜BR8.18、`entities.md`）
- `requirements.md`（NFR1〜NFR11、FR6）、`contract-summary.md`（C1、C8、C10）
- 手本と ID の続き: U6 の `nfr-requirements/` 全ファイル
- 既存コード（読むだけ）: `entries/api.ts`、`services/calendarService.ts`、`repositories/calendarRepository.ts`、`infrastructure/lib/app-stack.ts`

## 確かめた事実
- 詳細 NFR ID の最大は grep で確認: NFR1.29 / NFR2.43 / NFR3.10 / NFR4.64 / NFR5.12 / NFR6.7 / NFR7.32 / NFR8.12 / NFR9.7 / NFR10.7 / NFR11.6。
  U7 はこの次から振る: NFR1.30、NFR2.44、NFR3.11、NFR4.65、NFR5.13、NFR6.8、NFR7.33、NFR8.13、NFR9.8、NFR10.8、NFR11.7。
- `api` の Lambda は既に `Calendar` に GetItem/Query/PutItem/UpdateItem/DeleteItem/ConditionCheckItem、`ChoreTypes` に
  GetItem/Query/PutItem/UpdateItem/DeleteItem/ConditionCheckItem を持ち、環境変数 `CALENDAR_TABLE`・`CHORE_TYPES_TABLE` もある
  （U4・U5 で付与済み）。U7 は `api` に権限も環境変数も足さない → NFR4.65 は「足し済みの確認」。
- U7 は画面 API のみ（LINE なし）。入口は `POST /v1/duties/{dutyId}/status`・`PUT`・`DELETE /v1/months/{month}/confirmation`。
- 取引は `UpdateItem`（担当）＋ `ConditionCheck`（月の状態、markDone は単価も）。`buildMonthGuard`・`buildUnitPriceGuard`・
  `CHECK_DUTY_UNCHANGED`・`writeTransaction`・`classifyCancellation` は既存。確定・取り消しは version を条件にしない（BR8.14）。
- 性能の測定手順は U6 で直した方針（設定を手で書き換えない・日や家族を分ける・冷たい起動を実運用の割合で含める）と整合させる。

## 判断
- 人に聞く点はなし（機能設計の [Q1]〜[Q6] と要件で決まっている）。
- 費用 0 円（NFR1）は U7 では「LINE を 1 通も使わない（画面のみ）」「新しい課金対象を足さない」で守る。
