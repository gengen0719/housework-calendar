# 論理コンポーネント（Logical Components）— U2 招待

U2（`u2-invitation`）で足す・変えるコードと構成の部品です。U1 の構成（`construction/u1-skeleton-family/nfr-design/logical-components.md`、いまのコードは `packages/` と `infrastructure/`）に足します。

## 足す・変える部品

```
packages/
  shared/src/
    api-types.ts                    # 変える: Member、Invitation、InvitationPreview の型
    reasons.ts                      # 変える: IDEMPOTENCY_KEY_REUSED を足す
    messages.ts                     # 変える: INVITATION_NOT_FRIEND_HINT、INVITATION_SHARE_TEXT などを足す
  backend/src/
    entries/api.ts                  # 変える: パスの型で振り分ける。ログの path を型にする
    lib/router.ts                   # 足す: パスの型（:token）の照合
    services/
      invitationTokenService.ts     # 足す: 印の作成と形の確かめ
      familyMemberService.ts        # 変える: createInvitation、getCurrentInvitation、previewInvitation、acceptInvitation、listMembers
    repositories/
      invitationRepository.ts       # 足す: Invitations テーブル
      userRepository.ts             # 変える: familyId-index で読む、参加のトランザクション
      familyRepository.ts           # 変える: currentInvitationToken、作り直しのトランザクション
      requestRecordRepository.ts    # 変える: operation と target を持つ
    handlers/
      family/listMembers.ts         # 足す: GET /v1/family/members
      invitation/getCurrent.ts      # 足す: GET /v1/family/invitation
      invitation/create.ts          # 足す: POST /v1/family/invitations
      invitation/preview.ts         # 足す: GET /v1/invitations/{token}
      invitation/accept.ts          # 足す: POST /v1/invitations/{token}/accept
  frontend/src/
    pages/FamilySettingsPage.tsx    # 足す: メンバーの一覧と、管理者の招待の部分
    pages/InvitationPage.tsx        # 足す: 「（家族の名前）に参加しますか？」
    pages/RegisterPage.tsx          # 変える: 招待の印があるときの一言を足す
    pages/CalendarFramePage.tsx     # 変える: 「家族の設定」へ進むボタン
    liff/share.ts                   # 足す: shareTargetPicker とシェアの URL の切り替え
    invitation/readInvitationParam.ts # 足す: URL の印を読んで外す
infrastructure/lib/
  data-stack.ts                     # 変える: Invitations テーブル、Users の familyId-index
  app-stack.ts                      # 変える: 画面用の Lambda に Invitations の読み書きの権限、メトリクスフィルタ
```

## 障害の波及範囲

| 部品が止まったとき | 影響 | 影響しないもの |
|------------------|------|--------------|
| Invitations テーブル | 招待を作る・開く・参加するができない | U1 の操作、メンバーの一覧 |
| Users の familyId-index | メンバーの一覧が出ない | 招待、U1 の操作 |
| shareTargetPicker | シェアの URL に切り替える。コピーもできる | 招待の作成 |

## NFR の設計の決まりがどこに入るか

| 決まり | 部品 |
|-------|------|
| 印の強さと形（NFR4.14〜NFR4.16、NFR4.24） | `invitationTokenService.ts` |
| 使えるかの判断（BR3.6） | `familyMemberService.resolveUsableInvitation` |
| 作り直しと参加の整合（NFR2.10〜NFR2.12） | `familyRepository.ts`、`userRepository.ts` のトランザクション |
| 認可（NFR4.19〜NFR4.21） | U1 の `requireAuth`、`requireMembership`、`requireAdmin` |
| ログで印を伏せる（NFR4.26、NFR2.14） | `lib/router.ts`、`entries/api.ts`、`lib/logger.ts` |
| 画面での印（NFR4.23） | `readInvitationParam.ts` |
| LINE で送る（NFR1.10、NFR1.11） | `liff/share.ts` |
| TTL・テーブル・メトリクス（NFR1.8、NFR2.15） | `data-stack.ts`、`app-stack.ts` |

## Sources

- `construction/u2-invitation/nfr-requirements/*.md`
- `construction/u2-invitation/functional-design/functional-spec.md`
- `construction/u1-skeleton-family/nfr-design/logical-components.md`
- いまのコード（`packages/backend/src`、`packages/frontend/src`、`infrastructure/lib`）
- `nfr-design-questions.md` の回答 [Q1]、[Q2]

## Assumptions & Open Questions

- U1 の createFamily でも `familyJoinedAt` を入れるように直します（`entities.md` の Assumptions）
- ファイルの分け方は目安で、コード生成の計画で決めます
