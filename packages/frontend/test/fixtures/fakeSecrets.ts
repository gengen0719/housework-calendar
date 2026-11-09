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

// 招待の印（22 文字。本物ではない）
export const FAKE_INVITE_TOKEN = 'abcdefghijklmnopqrstuv'; // gitleaks:allow テスト用の作り物の値

// 冪等キー（Idempotency-Key）の UUID
export const FAKE_IDEMPOTENCY_KEY = '11111111-1111-4111-8111-111111111111'; // gitleaks:allow テスト用の作り物の値

// セッションの印（作り物）
export const FAKE_SESSION_TOKEN = 'session-token-1'; // gitleaks:allow テスト用の作り物の値

// 担当の ID（U5。UUID の形）
export const FAKE_DUTY_ID_1 = '44444444-4444-4444-8444-444444444441'; // gitleaks:allow テスト用の作り物の値
export const FAKE_DUTY_ID_2 = '44444444-4444-4444-8444-444444444442'; // gitleaks:allow テスト用の作り物の値

// 子供の ID（U5。UUID の形。3 人）
export const FAKE_CHILD_USER_ID_1 = '55555555-5555-4555-8555-555555555551'; // gitleaks:allow テスト用の作り物の値
export const FAKE_CHILD_USER_ID_2 = '55555555-5555-4555-8555-555555555552'; // gitleaks:allow テスト用の作り物の値
export const FAKE_CHILD_USER_ID_3 = '55555555-5555-4555-8555-555555555553'; // gitleaks:allow テスト用の作り物の値

// お手伝いの種類の ID（U5。UUID の形）
export const FAKE_CHORE_TYPE_ID_1 = '11111111-1111-4111-8111-111111111112'; // gitleaks:allow テスト用の作り物の値
export const FAKE_CHORE_TYPE_ID_2 = '22222222-2222-4222-8222-222222222223'; // gitleaks:allow テスト用の作り物の値

// 上書きの確かめの印（U5。64 文字の 16 進数）
export const FAKE_CHANGES_HASH = 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210'; // gitleaks:allow テスト用の作り物の値

// 担当の ID の続き（U5 の画面の筋書き用）
export const FAKE_DUTY_ID_3 = '44444444-4444-4444-8444-444444444443'; // gitleaks:allow テスト用の作り物の値
export const FAKE_DUTY_ID_4 = '44444444-4444-4444-8444-444444444444'; // gitleaks:allow テスト用の作り物の値

// 上書きの確かめの印の 2 つ目（確かめのあとに担当が変わった場合の新しい印）
export const FAKE_CHANGES_HASH_2 =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // gitleaks:allow テスト用の作り物の値
