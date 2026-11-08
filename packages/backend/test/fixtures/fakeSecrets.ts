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
