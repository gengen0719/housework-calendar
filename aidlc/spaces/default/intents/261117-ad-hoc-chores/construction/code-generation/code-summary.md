# 実装結果

日付詳細から管理者が子供と臨時用マスタを選び、単発のお手伝いを依頼できるようにした。未割り当て月も日付を開ける。家族の設定に臨時用マスタ管理を追加し、名前・単価・使用可否を既存の種類管理画面で扱う。

## Changes

- packages/shared/src/api-types.ts、reasons.ts、messages.ts: 互換性のあるpurpose/adhocと重複メッセージを追加。
- packages/backend/src/models.ts、handlers/choreType/create.ts、services/choreTypeService.ts、repositories/choreTypeRepository.ts: 臨時用用途と独立した名前の一意キー。用途は登録後変更不可。臨時マスタは物理削除せず使用停止で管理。
- packages/backend/src/handlers/calendar/createAdhocDuty.ts、services/adhocDutyService.ts、entries/api.ts: POST /v1/duties。管理者・家族・日付・種類・子供を検証し、既存の担当＋ID参照Putと月未確定・種類active/用途・子供所属のConditionCheckを1取引にする。同日同種類・再送・同時追加は重複を作らない。
- packages/backend/src/services/assignmentPlanner.ts、calendarService.ts、handlers/calendar/recordDuty.ts: originとは別のadhocを保持し、通常月再生成で変更削除しない。既存の記録・金額集計・定時通知を利用する。
- packages/frontend/src/App.tsx、pages/FamilySettingsPage.tsx、ChoreTypesPage.tsx、AssignmentPage.tsx、CalendarPage.tsx、DayDetail.tsx、api/client.ts、新規components/AdhocDutyForm.tsx: 設定入口・用途別表示、通常割り当てからの除外、日付の追加フォーム、保存失敗時の入力保持、重複送信防止、未入力月の日付表示。
- 新規テスト: packages/backend/test/ad-hoc-chores/adhoc.test.ts、packages/frontend/test/ad-hoc-chores/DayDetail.test.tsx、Master.test.tsx。既存calendar.steps.tsxの「割り当て未入力時は日付なし」の期待を新要件へ更新。

## Decisions

既存項目のpurpose省略はregular扱いとし移行は不要。臨時識別は担当のadhocで、originがmanual/swapに変わっても残る。種類のIDは通常/臨時で別なので保存キーは従来の同日同種類1件を維持できる。新規依存・インフラ・直接デプロイはない。

## Validation

- 基準値: npm test、240ファイル、4192成功・2skip、行96.29%。
- BDD: シナリオを実装前に追加し、未実装で失敗することを確認してから実装。新規最終18件成功。
- 準備コマンド npx vitest run packages/backend/test/u5-assignment-calendar: 344件成功。
- 関連回帰コマンド: 32ファイル736件成功。
- 最終全体: npm test -- --maxWorkers=4、243ファイル4210成功・2skip（4212総数）、失敗0。行96.14%（3919/4076）、文94.61%、分岐90.22%、関数94.73%。閾値80%を維持。
- npm testの並列無制限実行でfork worker起動timeout3件が出たため、プロジェクト設定を変えず並列数4で再実行して成功。テストやcoverage範囲を減らしていない。
- npm run lint、4パッケージ（shared/backend/frontend/infrastructure）のnpx tsc --noEmit -p、frontend build、変更ファイルのPrettier、git diff --checkが成功。
- APIの実入口からfake Dynamoの条件式評価まで通したシナリオで、保存直前の月確定/種類使用停止/子供所属変更、同時追加、担当変更後の月再保存保持、記録単価100円と既存通知・お小遣いへの統合を確認。

## Limitations

画面テストはjsdomで実行。実ブラウザー・実LINE・AWS環境での動作確認とCI実行は未実施。公開/commit/pushはしていない。

## Deviations

既存feature/family-action-menuがmainより1commit先で前回変更を含んでいたため、それを失わない現在HEADからfeature/ad-hoc-choresを作成（mainを祖先に持つ）。計画の主要対象に加え、記録応答のmapperと物理削除防止、名前キーの用途分離を必要な互換対応として実装した。
