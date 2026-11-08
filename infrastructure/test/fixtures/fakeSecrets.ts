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

export const FAKE_ORIGIN_VERIFY_SECRET = 'dummy-origin-verify-secret-for-tests'; // gitleaks:allow テスト用の作り物の値

// GitHub Actions の OIDC で、IAM ロールの信頼ポリシーに現れる条件キー（秘密ではないが、名前に token を含む）
export const GITHUB_OIDC_AUD_CONDITION_KEY = 'token.actions.githubusercontent.com:aud'; // gitleaks:allow テスト用の作り物の値
export const GITHUB_OIDC_SUB_CONDITION_KEY = 'token.actions.githubusercontent.com:sub'; // gitleaks:allow テスト用の作り物の値
