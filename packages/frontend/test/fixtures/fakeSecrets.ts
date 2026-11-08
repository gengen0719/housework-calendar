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
