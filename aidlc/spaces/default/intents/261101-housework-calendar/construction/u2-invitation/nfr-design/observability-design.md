# 見守りの設計（Observability Design）— U2 招待

U2（`u2-invitation`）の見守りの要件（NFR2.9、NFR2.14、NFR2.15、NFR7.11）を、どう作るかを書きます。U1 の設計（`lib/logger.ts` の 1 行 1 件の JSON、リクエスト ID、30 日）はそのまま使います。

## 招待のできごとのログ（NFR2.9）

| `event` | いつ | 項目 |
|---------|------|------|
| `INVITATION_CREATED` | 招待を作った | `familyId`、`userId`、`tokenPrefix`、`replacedPrevious`（true/false） |
| `INVITATION_ACCEPTED` | 参加した | `familyId`、`userId`、`tokenPrefix` |
| `INVITATION_REJECTED` | 招待を開く・参加するで断った | `userId`、`reason`（`INVITATION_INVALID`、`ALREADY_IN_OTHER_FAMILY`、`ALREADY_IN_FAMILY`）、`tokenPrefix`（形が正しいときだけ）、`familyId`（分かるときだけ） |

- `tokenPrefix` は印の先頭 4 文字（NFR5.7）。印の全体は書かない
- 子供の招待の作成（`ADMIN_ONLY`）は、U1 の `REQUEST_REJECTED` のログで残る

## 印を伏せる（NFR2.14）

- 要求のログの `path` はパスの型（`/v1/invitations/:token` など）で書く（`security-design.md`）
- `logger` に渡す前に値を組み立てる関数を用意し、`token` という名前の項目は受け付けない（型で禁止する）
- 単体テスト: 招待の各操作を動かし、出たログの行のどれにも印の全体が含まれないこと

## 使えない印の数（NFR2.15）

- CloudWatch Logs のメトリクスフィルタで、`event = INVITATION_REJECTED` かつ `reason = INVITATION_INVALID` の行を数える（メトリクス名 `InvitationInvalidCount`、環境ごと）
- メトリクスフィルタとカスタムメトリクス 1 つは無料枠（カスタムメトリクス 10 個）の中
- しきい値（1 時間に 20 回）のアラームと知らせの送り先は U10 で足す。それまでは、作り手が週に 1 回 CloudWatch のメトリクスを見る手順を README に書く

## かかった時間（NFR7.11）

- U1 の `REQUEST_END` の `durationMs` に、パスの型の `path` が付くので、操作ごとの時間をログから読める

## Sources

- `construction/u2-invitation/nfr-requirements/observability-requirements.md`
- `construction/u1-skeleton-family/nfr-design/observability-design.md`
- `packages/backend/src/lib/logger.ts`、`packages/backend/src/entries/api.ts`

## Assumptions & Open Questions

- [assumption] CloudWatch のカスタムメトリクスは、U1 と U2 を合わせても無料枠の 10 個以内です。U10 でアラームを足すときに、もう一度数えます
