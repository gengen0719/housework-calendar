// テストで使う「作り物の秘密の値」と、秘密の値に見える名前の置き場。
//
// なぜここに集めるか:
//   gitleaks は値の「ランダムっぽさ」（エントロピー）で鍵を見つけるので、
//   テスト用の作り物でも、どれが検出されるかを事前には読めない。
//   そこで、秘密の値に見えるものは必ずこのファイルに置き、各行に
//   `// gitleaks:allow テスト用の作り物の値` を付ける。
//   テストの中には直接書かず、ここから import する。
//   ESLint（eslint.config.js の最後のブロック）が、test/ 以下での直書きを error にする。
//
// ここに置いてよいのは作り物だけ。本物の鍵やトークンは絶対に置かない。

// 冪等キー（Idempotency-Key）の UUID
export const FAKE_IDEMPOTENCY_KEY_1 = '00000000-0000-4000-8000-000000000001'; // gitleaks:allow テスト用の作り物の値
export const FAKE_IDEMPOTENCY_KEY_2 = '00000000-0000-4000-8000-000000000002'; // gitleaks:allow テスト用の作り物の値

// UUID の形をした作り物の ID（種類の ID など。UUID の形は gitleaks に拾われやすい）
export const FAKE_CHORE_TYPE_ID_1 = '11111111-1111-4111-8111-111111111111'; // gitleaks:allow テスト用の作り物の値
export const FAKE_CHORE_TYPE_ID_2 = '22222222-2222-4222-8222-222222222222'; // gitleaks:allow テスト用の作り物の値
export const FAKE_CHORE_TYPE_ID_3 = '33333333-3333-4333-8333-333333333333'; // gitleaks:allow テスト用の作り物の値
export const FAKE_CHORE_TYPE_ID_4 = '88888888-8888-4888-8888-888888888884'; // gitleaks:allow テスト用の作り物の値

// 担当の ID（U5。UUID の形）
export const FAKE_DUTY_ID_1 = '44444444-4444-4444-8444-444444444441'; // gitleaks:allow テスト用の作り物の値
export const FAKE_DUTY_ID_2 = '44444444-4444-4444-8444-444444444442'; // gitleaks:allow テスト用の作り物の値
export const FAKE_DUTY_ID_3 = '44444444-4444-4444-8444-444444444443'; // gitleaks:allow テスト用の作り物の値
// 子供の ID（U5。UUID の形。3 人）
export const FAKE_CHILD_USER_ID_1 = '55555555-5555-4555-8555-555555555551'; // gitleaks:allow テスト用の作り物の値
export const FAKE_CHILD_USER_ID_2 = '55555555-5555-4555-8555-555555555552'; // gitleaks:allow テスト用の作り物の値
export const FAKE_CHILD_USER_ID_3 = '55555555-5555-4555-8555-555555555553'; // gitleaks:allow テスト用の作り物の値
// ほかの家族の ID（U5。UUID の形）
export const FAKE_OTHER_FAMILY_ID = '66666666-6666-4666-8666-666666666661'; // gitleaks:allow テスト用の作り物の値
// ほかの家族の種類の ID と、同じ家族のもう 1 人の管理者の ID（U5。UUID の形）
export const FAKE_OTHER_CHORE_TYPE_ID = '77777777-7777-4777-8777-777777777771'; // gitleaks:allow テスト用の作り物の値
export const FAKE_ADMIN_USER_ID = '99999999-9999-4999-8999-999999999991'; // gitleaks:allow テスト用の作り物の値
// 大文字の UUID（U5。「小文字だけ通す」の確認用）
export const FAKE_UPPERCASE_UUID = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'; // gitleaks:allow テスト用の作り物の値
// 上書きの確かめの印（U5。64 文字の 16 進数。形は正しいが合わない印）
export const FAKE_CHANGES_HASH_MISMATCH =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // gitleaks:allow テスト用の作り物の値
// 形が正しくない印（U5。64 文字の 16 進数ではない）
export const FAKE_CHANGES_HASH_MALFORMED = 'not-a-hex-hash'; // gitleaks:allow テスト用の作り物の値

// UUID ではない冪等キー（400 の確認用）
export const FAKE_NOT_A_UUID_IDEMPOTENCY_KEY = 'not-a-uuid'; // gitleaks:allow テスト用の作り物の値

// 署名と認可ヘッダーの作り物
export const FAKE_WRONG_LINE_SIGNATURE = 'bm90LXRoZS1yaWdodC1zaWduYXR1cmU='; // gitleaks:allow テスト用の作り物の値
export const FAKE_BASIC_AUTHORIZATION = 'Basic abc'; // gitleaks:allow テスト用の作り物の値

// 別の署名鍵（「違う鍵で署名した印は通らない」の確認用）
export const FAKE_OTHER_SIGNING_SECRET = 'other-secret-0123456789'; // gitleaks:allow テスト用の作り物の値
export const FAKE_ANOTHER_SIGNING_SECRET = 'another-secret-0123456789abcdef'; // gitleaks:allow テスト用の作り物の値

// 招待の印（差し替え後の値の確認用）
export const FAKE_ROTATED_INVITE_TOKEN = 'RotatedRotatedRotated1'; // gitleaks:allow テスト用の作り物の値
export const FAKE_OTHER_INVITE_TOKEN = 'OtherOtherOtherOther12'; // gitleaks:allow テスト用の作り物の値

// SSM のパラメーターに入れる作り物の値
export const FAKE_SIGNING_SECRET = 'test-signing-secret-0123456789abcdef'; // gitleaks:allow テスト用の作り物の値
export const FAKE_CHANNEL_SECRET = 'test-channel-secret'; // gitleaks:allow テスト用の作り物の値
export const FAKE_ORIGIN_SECRET = 'test-origin-secret'; // gitleaks:allow テスト用の作り物の値
export const FAKE_CHANNEL_ACCESS_TOKEN = 'test-access-token'; // gitleaks:allow テスト用の作り物の値
export const FAKE_VALID_ID_TOKEN = 'valid-id-token'; // gitleaks:allow テスト用の作り物の値

// SSM のパラメーター名（秘密ではないが、名前に secret / token を含む）
export const SSM_NAME_LINE_CHANNEL_SECRET = 'line/channel-secret'; // gitleaks:allow テスト用の作り物の値
export const SSM_NAME_LINE_CHANNEL_ACCESS_TOKEN = 'line/channel-access-token'; // gitleaks:allow テスト用の作り物の値
export const SSM_NAME_JWT_SIGNING_SECRET = 'jwt/signing-secret'; // gitleaks:allow テスト用の作り物の値
export const SSM_NAME_ORIGIN_VERIFY_SECRET = 'cloudfront/origin-verify-secret'; // gitleaks:allow テスト用の作り物の値

// 招待の印（22 文字。本物ではない）
export const FAKE_SUZUKI_INVITE_TOKEN = 'SuzukiSuzukiSuzukiSuzu'; // gitleaks:allow テスト用の作り物の値
export const FAKE_UNKNOWN_INVITE_TOKEN = 'UnknownUnknownUnknown1'; // gitleaks:allow テスト用の作り物の値
export const FAKE_MALFORMED_INVITE_TOKEN = 'not-a-valid-token'; // gitleaks:allow テスト用の作り物の値
export const FAKE_VALID_INVITE_TOKEN = 'ValidValidValidValid12'; // gitleaks:allow テスト用の作り物の値
export const FAKE_MIXED_CASE_INVITE_TOKEN = 'AbCdEfGhIjKlMnOpQrStUv'; // gitleaks:allow テスト用の作り物の値
export const FAKE_NEW_INVITE_TOKEN = 'NewTokenNewTokenNewTok'; // gitleaks:allow テスト用の作り物の値
export const FAKE_PREVIOUS_INVITE_TOKEN = 'PrevPrevPrevPrevPrevPr'; // gitleaks:allow テスト用の作り物の値

// 項目名（DynamoDB の属性名）。名前に token を含む
export const ATTR_PREVIOUS_TOKEN_PLACEHOLDER = ':previousToken'; // gitleaks:allow テスト用の作り物の値

// ルートの表のキー（名前に :token を含む）
export const ROUTE_KEY_INVITATION_PREVIEW = 'GET /v1/invitations/:token'; // gitleaks:allow テスト用の作り物の値
export const ROUTE_KEY_INVITATION_ACCEPT = 'POST /v1/invitations/:token/accept'; // gitleaks:allow テスト用の作り物の値

// ログで秘密の値を伏せたあとに残る目印（秘密ではないが、idToken などの項目に入る文字列）
export const REDACTED_MARKER = '[REDACTED]'; // gitleaks:allow テスト用の作り物の値

// U6（記録）で足す作り物の値
// 家族に入っていない人の LINE のユーザー ID（1 対 1 の入口の確認用）
export const FAKE_OUTSIDER_LINE_ID = 'U_outsider_u6'; // gitleaks:allow テスト用の作り物の値
// どの利用者の記録にもない LINE のユーザー ID（「記録なし」の確認用）
export const FAKE_UNKNOWN_LINE_ID = 'U_unknown_u6'; // gitleaks:allow テスト用の作り物の値
// HMAC の鍵（64 文字の 16 進数。U6 の筋書きで鍵らしい値が要るとき用）
export const FAKE_HMAC_SECRET_U6 =
  'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789'; // gitleaks:allow テスト用の作り物の値

// U6（記録）の筋書き・単体テストで使う、作り物の担当 ID と種類 ID（UUID の形）。
// 連番で多数の担当・種類が要る場面は、下のヘルパーで index から作る（直書きを避ける）。
export const FAKE_U6_DUTY_ID_A = '00000000-0000-4000-8000-0000000000a1'; // gitleaks:allow テスト用の作り物の値
export const FAKE_U6_DUTY_ID_B = '00000000-0000-4000-8000-0000000000b2'; // gitleaks:allow テスト用の作り物の値
export const FAKE_U6_DUTY_ID_C = '00000000-0000-4000-8000-0000000000c3'; // gitleaks:allow テスト用の作り物の値
export const FAKE_U6_DUTY_ID_D = '00000000-0000-4000-8000-0000000000d4'; // gitleaks:allow テスト用の作り物の値
export const FAKE_U6_DUTY_ID_E = '00000000-0000-4000-8000-0000000000e5'; // gitleaks:allow テスト用の作り物の値

/** index（0〜999）から作り物の担当 ID を作る。UUID の形だが本物ではない。 */
export const fakeU6DutyId = (index: number): string =>
  `00000000-0000-4000-8000-0000000d${String(index).padStart(4, '0')}`; // gitleaks:allow テスト用の作り物の値

/** index（0〜999）から作り物の種類 ID を作る。UUID の形だが本物ではない。 */
export const fakeU6ChoreTypeId = (index: number): string =>
  `aaaaaaaa-aaaa-4aaa-8aaa-0000000c${String(index).padStart(4, '0')}`; // gitleaks:allow テスト用の作り物の値

// U6（記録）: 家族の中に存在しない担当 ID（NOT_FOUND / 404 の確認用）。UUID の形だが本物ではない。
export const FAKE_U6_NONEXISTENT_DUTY_ID = '00000000-0000-4000-8000-0000000000ee'; // gitleaks:allow テスト用の作り物の値

// U7（確認・修正と確定）で足す作り物の値。
// 担当 ID・子供 ID・管理者 ID・ほかの家族の ID・月は U5・U6 のものを再利用する（上の定義）。
// U7 で新しく要るのは、確定・取り消しの筋書きで使う作り物の月と、記録のない担当 ID だけ。
// 確定した月（記録のない月の確定の確認用。YYYY-MM）
export const FAKE_U7_CONFIRMED_MONTH = '2027-02'; // gitleaks:allow テスト用の作り物の値
// 記録のない月（行のない月。確定・取り消しの冪等の確認用。YYYY-MM）
export const FAKE_U7_EMPTY_MONTH = '2000-01'; // gitleaks:allow テスト用の作り物の値
// 過去の確定していない月（月をまたいでも直せることの確認用。YYYY-MM）
export const FAKE_U7_PAST_MONTH = '2026-12'; // gitleaks:allow テスト用の作り物の値
// U7 の筋書き・単体テストで使う作り物の担当 ID（UUID の形。状態の変更の 5 とおり用）
export const FAKE_U7_DUTY_ID_A = '00000000-0000-4000-8000-0000000007a1'; // gitleaks:allow テスト用の作り物の値
export const FAKE_U7_DUTY_ID_B = '00000000-0000-4000-8000-0000000007b2'; // gitleaks:allow テスト用の作り物の値
export const FAKE_U7_DUTY_ID_C = '00000000-0000-4000-8000-0000000007c3'; // gitleaks:allow テスト用の作り物の値
// U7: 家族の中に存在しない担当 ID（NOT_FOUND / 404 の確認用）。UUID の形だが本物ではない。
export const FAKE_U7_NONEXISTENT_DUTY_ID = '00000000-0000-4000-8000-0000000007ee'; // gitleaks:allow テスト用の作り物の値

// U8（代わりにやる）で足す作り物の値。
// 担当 ID・子供 ID・管理者 ID・ほかの家族の ID・月は U5・U6・U7 のものを再利用する（上の定義）。
// 申し出の ID（UUID の形。古いボタンの確認用に 2 種類以上）
export const FAKE_U8_OFFER_ID_1 = '00000000-0000-4000-8000-0000000008a1'; // gitleaks:allow テスト用の作り物の値
export const FAKE_U8_OFFER_ID_2 = '00000000-0000-4000-8000-0000000008b2'; // gitleaks:allow テスト用の作り物の値
export const FAKE_U8_OFFER_ID_3 = '00000000-0000-4000-8000-0000000008c3'; // gitleaks:allow テスト用の作り物の値
// U8 の筋書き・単体テストで使う作り物の担当 ID（UUID の形）
export const FAKE_U8_DUTY_ID_A = '00000000-0000-4000-8000-0000000008d1'; // gitleaks:allow テスト用の作り物の値
export const FAKE_U8_DUTY_ID_B = '00000000-0000-4000-8000-0000000008d2'; // gitleaks:allow テスト用の作り物の値
export const FAKE_U8_DUTY_ID_C = '00000000-0000-4000-8000-0000000008d3'; // gitleaks:allow テスト用の作り物の値
export const FAKE_U8_DUTY_ID_D = '00000000-0000-4000-8000-0000000008d4'; // gitleaks:allow テスト用の作り物の値
// U8: 家族の中に存在しない担当 ID（NOT_FOUND の確認用）。UUID の形だが本物ではない。
export const FAKE_U8_NONEXISTENT_DUTY_ID = '00000000-0000-4000-8000-0000000008ee'; // gitleaks:allow テスト用の作り物の値

/** index（0〜999）から作り物の担当 ID を作る（11 件以上の一覧・300 件のフックの確認用）。UUID の形だが本物ではない。 */
export const fakeU8DutyId = (index: number): string =>
  `00000000-0000-4000-8000-00000008${String(index).padStart(4, '0')}`; // gitleaks:allow テスト用の作り物の値

/** index（0〜999）から作り物の種類 ID を作る（11 件以上の一覧用）。UUID の形だが本物ではない。 */
export const fakeU8ChoreTypeId = (index: number): string =>
  `bbbbbbbb-bbbb-4bbb-8bbb-0000000c${String(index).padStart(4, '0')}`; // gitleaks:allow テスト用の作り物の値

// U8: LINE のグループ ID・ユーザー ID・reply トークンの作り物（ログに出ないことの確認用の目印を兼ねる）
export const FAKE_U8_GROUP_ID = 'C_u8_group_registered'; // gitleaks:allow テスト用の作り物の値
export const FAKE_U8_UNREGISTERED_GROUP_ID = 'C_u8_group_unregistered'; // gitleaks:allow テスト用の作り物の値
export const FAKE_U8_OUTSIDER_LINE_ID = 'U_u8_outsider'; // gitleaks:allow テスト用の作り物の値
export const FAKE_U8_REPLY_TOKEN_PREFIX = 'reply-u8-'; // gitleaks:allow テスト用の作り物の値
// U8: 月（YYYY-MM）
export const FAKE_U8_NEXT_MONTH = '2027-02'; // gitleaks:allow テスト用の作り物の値
// U8: 名前を伏せ字で確かめるための作り物の目印（タグ・改行・21 文字以上を含む表示名・種類の名前）
export const FAKE_U8_MARKER_DISPLAY_NAME = '<b>目印の表示名</b>\n二行目'; // gitleaks:allow テスト用の作り物の値
export const FAKE_U8_MARKER_LONG_CHORE_NAME =
  '目印の長い名前あいうえおかきくけこさしすせそたちつてと'; // gitleaks:allow テスト用の作り物の値
// U9（お小遣いの額）で足す作り物の値。
// 家族・子供・管理者・種類・担当の ID は U5〜U8 のものを再利用する（上の定義）。
// 抜けた子供・メンバーでない人の利用者 ID（UUID の形）
export const FAKE_U9_DEPARTED_USER_ID = '00000000-0000-4000-8000-0000000009a1'; // gitleaks:allow テスト用の作り物の値
export const FAKE_U9_DEPARTED_USER_ID_2 = '00000000-0000-4000-8000-0000000009a2'; // gitleaks:allow テスト用の作り物の値
export const FAKE_U9_OUTSIDER_USER_ID = '00000000-0000-4000-8000-0000000009a3'; // gitleaks:allow テスト用の作り物の値
// U9 の担当 ID（UUID の形）
export const FAKE_U9_DUTY_ID_A = '00000000-0000-4000-8000-0000000009d1'; // gitleaks:allow テスト用の作り物の値
/** index（0〜999）から作り物の担当 ID を作る（異常 300 件・読み取り回数の確認用）。UUID の形だが本物ではない。 */
export const fakeU9DutyId = (index: number): string =>
  `00000000-0000-4000-8000-00000009${String(index).padStart(4, '0')}`; // gitleaks:allow テスト用の作り物の値
/** index（0〜999）から作り物の子供 ID を作る（抜けた子供が多い場合の確認用）。 */
export const fakeU9ChildId = (index: number): string =>
  `00000000-0000-4000-8000-0000009c${String(index).padStart(4, '0')}`; // gitleaks:allow テスト用の作り物の値
/** index（0〜999）から作り物の種類 ID を作る（種類が一覧にない異常・種類が 10 個の確認用）。UUID の形だが本物ではない。 */
export const fakeU9ChoreTypeId = (index: number): string =>
  `cccccccc-cccc-4ccc-8ccc-0000000c${String(index).padStart(4, '0')}`; // gitleaks:allow テスト用の作り物の値
// U9: 月（YYYY-MM）
export const FAKE_U9_MONTH = '2027-01'; // gitleaks:allow テスト用の作り物の値
export const FAKE_U9_PREVIOUS_MONTH = '2026-12'; // gitleaks:allow テスト用の作り物の値
export const FAKE_U9_NEXT_MONTH = '2027-02'; // gitleaks:allow テスト用の作り物の値
// U9: ログに出ないことを確かめるための作り物の目印（表示名・種類の名前・金額の数字）
export const FAKE_U9_MARKER_DISPLAY_NAME = '目印の子供名ユーキューマーカー'; // gitleaks:allow テスト用の作り物の値
export const FAKE_U9_MARKER_CHORE_NAME = '目印のお手伝いユーキューマーカー'; // gitleaks:allow テスト用の作り物の値
export const FAKE_U9_MARKER_UNIT_PRICE = 7777; // gitleaks:allow テスト用の作り物の値
export const FAKE_U9_MARKER_ADJUSTMENT_AMOUNT = -4321; // gitleaks:allow テスト用の作り物の値
export const FAKE_U9_MARKER_ADJUSTMENT_REASON = '目印の理由ユーキューマーカー'; // gitleaks:allow テスト用の作り物の値
