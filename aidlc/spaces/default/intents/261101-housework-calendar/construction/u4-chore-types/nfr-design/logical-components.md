# 論理コンポーネント（Logical Components）— U4 お手伝いの種類

U4（`u4-chore-types`）で足す・変えるコードと構成の部品です。U1〜U3 の構成に足します。お手伝いの種類の部品は、家族とメンバーの部品とは別のサービスとリポジトリにし、カレンダーには頼りません（ADR-001）。

## 足す・変える部品

```
packages/
  shared/src/
    reasons.ts                          # 変える: INVALID_CHORE_TYPE_NAME、CHORE_TYPE_NAME_TAKEN、INVALID_DESCRIPTION、INVALID_REQUEST、CHORE_TYPE_STATE_CHANGED
    messages.ts                         # 変える: 名前・説明・使われている・重なり（2 通り）の文言、案内の文言
    api-types.ts                        # 変える: ChoreType、ChoreTypeInput
    choreTypeValidation.ts              # 足す: normalizeChoreName、validateUnitPrice、normalizeDescription（画面と裏側で同じもの）
  backend/src/
    entries/api.ts                      # 変える: /v1/chore-types と /v1/chore-types/:choreTypeId の 5 つ
    handlers/choreType/{list,create,update,setActive,remove}.ts  # 足す
    services/choreTypeService.ts        # 足す: C7（list、create、update、setActive、getCurrentUnitPrice、delete）
    services/calendarPort.ts            # 足す: C8 isChoreTypeAssigned の仮の窓口（false を返す。差し替えられる形。U5 で本物にする）
    repositories/choreTypeRepository.ts # 足す: ChoreTypes テーブル（種類と名前の印）
    lib/logger.ts                       # 変える: name、description を型と実行時の伏せ字で禁止
  frontend/src/
    pages/ChoreTypesPage.tsx            # 足す: 一覧、追加・変更の入力、使わない・使う・消す
    pages/FamilySettingsPage.tsx        # 変える: 「お手伝いの種類」へ進むボタン
    api/client.ts                       # 変える: 5 つの操作
infrastructure/lib/
  data-stack.ts                         # 変える: ChoreTypes テーブル
  app-stack.ts                          # 変える: api のロールの許可、環境変数 CHORE_TYPES_TABLE
```

## 障害の波及範囲

| 部品が止まったとき | 影響 | 影響しないもの |
|------------------|------|--------------|
| `ChoreTypes` テーブル | 種類の画面が使えない。U5 以降の割り当て・記録で単価が読めない | 友だち登録、家族、招待、お知らせ先 |

## NFR の設計の決まりがどこに入るか

| 決まり | 部品 |
|-------|------|
| 確かめの順番と家族の範囲（NFR4.34〜NFR4.36、NFR4.41） | `handlers/choreType/*`、`choreTypeRepository.ts`（キーに家族） |
| 入力の確かめ（NFR4.37、NFR4.40） | `shared/choreTypeValidation.ts`、各ハンドラーの zod |
| 名前の重なりとトランザクション（NFR2.24〜NFR2.26） | `choreTypeRepository.ts`、`choreTypeService.ts` |
| 送り直し（NFR4.39） | U1 の `requestRecordRepository.ts` |
| 仮の C8（NFR8.8） | `services/calendarPort.ts` |
| ログ（NFR2.27） | `lib/logger.ts`、各ハンドラー |
| 画面（NFR4.38、NFR9.4） | `ChoreTypesPage.tsx` |
| テーブルと権限（NFR1.16、NFR6.5） | `data-stack.ts`、`app-stack.ts` |

## Sources

- `construction/u4-chore-types/nfr-requirements/*.md`
- `construction/u4-chore-types/functional-design/functional-spec.md`
- `inception/domain-design/components.md`（ADR-001）
- `construction/u3-notification-group/nfr-design/logical-components.md`

## Assumptions & Open Questions

- ファイルの分け方は目安で、コード生成の計画で決めます
