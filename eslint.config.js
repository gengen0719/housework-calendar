import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

// テストの中に直接書いてはいけない「秘密らしいもの」の名前。
// ESLint は補助であり、最終の防御は push 前の `npm run secrets:scan`（README 参照）。
const SECRET_NAME =
  '/secret|token|password|passwd|credential|api_?key|key$|^key|_key|authorization/i';

const FAKE_SECRET_MESSAGE =
  '作り物の秘密の値は test/fixtures/fakeSecrets.ts に置き、そこから import してください（gitleaks 対策）。';

// 注意: 上の SECRET_NAME は esquery の正規表現として使うので、「/」を中に書かないこと。
const fakeSecretSelectors = [
  // 名前が秘密らしいものへの代入（文字列、式なしのテンプレート、文字列の連結）
  // 絞り込み（無害なものを止めないため）:
  //   - [GITHUB_OIDC_AUD_CONDITION_KEY]: ... のような計算されたキーは名前ではないので対象外（computed=false）
  //   - DynamoDB の KeyConditionExpression など、名前が Expression で終わるものは式なので対象外
  //   - 値が `$default` や `POST /v1/...` の形（ルートの表）のものは対象外
  // （`> Literal.value` の .value は「プロパティの値の側」。キーの文字列自体を拾わないため）
  ...[
    [`VariableDeclarator[id.name=${SECRET_NAME}]`, 'init'],
    [`Property[computed=false][key.name=${SECRET_NAME}]:not([key.name=/Expression$/])`, 'value'],
    [`Property[key.value=${SECRET_NAME}]`, 'value'],
  ].flatMap(([owner, field]) => [
    `${owner} > Literal.${field}[value=/^(?!\\$|[A-Z]+ \\x2f).{8,}$/]`,
    `${owner} > TemplateLiteral.${field}[quasis.length=1]`,
    `${owner} > BinaryExpression.${field}[operator='+']`,
  ]),
  // 値の形が秘密らしいもの（名前によらない）: UUID の形
  'Literal[value=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i]',
  // 値の形が秘密らしいもの: 20 文字以上で [A-Za-z0-9_-+/=.] だけの文字列。
  // ただし、そのままだと「スタック名、エラーの理由、パス、テスト ID」など無害な文字列まで
  // 数十件が該当して使えないため、次の 2 つで絞る（README に理由を書いてある）。
  //   - 英字と数字の両方を含む（乱数らしさの最低限。全部英字の文字列は名前の selector に任せる）
  //   - 先頭が「/」でない（URL のパスやファイルのパスを除く）
  // import / require / vi.mock などのモジュール指定も対象外にする。
  // （\x2f は「/」。esquery の正規表現の中に「/」を直接書けないため）
  ':not(ImportDeclaration, ExportAllDeclaration, ExportNamedDeclaration, ImportExpression, CallExpression[callee.name=/^(require|import|loadFeature)$/], CallExpression[callee.property.name=/^(mock|doMock|importActual|importOriginal)$/]) > Literal[value=/^(?=.*[0-9])(?=.*[A-Za-z])(?!\\x2f)[A-Za-z0-9_\\-+\\x2f=.]{20,}$/]',
];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cdk.out/**',
      '**/coverage/**',
      'aidlc/**',
      '.kiro/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: '19' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react/no-danger': 'error',
      // 招待の印は暗号論的な乱数（crypto.randomBytes）で作る。Math.random は使わない（NFR4.14）
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: '印や識別子には crypto.randomBytes / crypto.randomUUID を使ってください。',
        },
      ],
    },
  },
  {
    // テストの作り物の秘密の値（鍵、トークン、印）は、gitleaks が「本物の鍵」と見分けられないことがある。
    // そのため、テストの中に直接書かず、各パッケージの test/fixtures/fakeSecrets.ts から import する。
    // fakeSecrets.ts の各行には `// gitleaks:allow` を付ける（README の「テストの作り物の秘密の値」）。
    files: ['**/test/**/*.{ts,tsx}'],
    ignores: ['**/test/fixtures/fakeSecrets.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...fakeSecretSelectors.map((selector) => ({ selector, message: FAKE_SECRET_MESSAGE })),
      ],
    },
  },
);
