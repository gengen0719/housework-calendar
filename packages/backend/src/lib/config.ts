import { GetParametersCommand, SSMClient } from '@aws-sdk/client-ssm';

/** パラメータストアから読む設定。Lambda の起動のとき 1 回だけ読む（NFR7.4、Q5）。 */
export interface AppConfig {
  channelSecret: string;
  channelAccessToken: string;
  loginChannelId: string;
  /** LINE の中で画面を開く LIFF の URL */
  liffUrl: string;
  signingSecret: string;
  originVerifySecret: string;
}

/** `${SSM_PREFIX}/` からの相対パス */
const PARAMETER_PATHS: Record<keyof AppConfig, string> = {
  channelSecret: 'line/channel-secret',
  channelAccessToken: 'line/channel-access-token',
  loginChannelId: 'line/login-channel-id',
  liffUrl: 'line/liff-url',
  signingSecret: 'jwt/signing-secret',
  originVerifySecret: 'cloudfront/origin-verify-secret',
};

const ALL_KEYS = Object.keys(PARAMETER_PATHS) as (keyof AppConfig)[];

/**
 * 入口（環境変数 ENTRY）ごとに読む値。Lambda のロールは、この値の分だけ読む権限を持つ
 * （infrastructure/lib/app-stack.ts の grantParameters と合わせる）。
 * LINE 用の受け口は JWT の鍵もログインのチャネル ID も使わないので、読まない（読む権限もない）。
 */
const KEYS_BY_ENTRY: Record<string, readonly (keyof AppConfig)[]> = {
  api: ALL_KEYS,
  line: ['channelSecret', 'channelAccessToken', 'liffUrl', 'originVerifySecret'],
};

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`環境変数 ${name} が設定されていません`);
  return value;
}

export async function loadConfig(
  client: SSMClient = new SSMClient({}),
  prefix: string = requireEnv('SSM_PREFIX'),
  entry: string = process.env.ENTRY ?? 'api',
): Promise<AppConfig> {
  const keys = KEYS_BY_ENTRY[entry];
  if (!keys) throw new Error(`知らない入口です（環境変数 ENTRY）: ${entry}`);
  const names = keys.map((key) => `${prefix}/${PARAMETER_PATHS[key]}`);
  const response = await client.send(
    new GetParametersCommand({ Names: names, WithDecryption: true }),
  );
  if (response.InvalidParameters && response.InvalidParameters.length > 0) {
    // 値は含めず、パスだけを知らせる
    throw new Error(`パラメータストアに値がありません: ${response.InvalidParameters.join(', ')}`);
  }
  const byName = new Map((response.Parameters ?? []).map((p) => [p.Name, p.Value]));
  const config = {} as AppConfig;
  for (const key of ALL_KEYS) {
    const path = `${prefix}/${PARAMETER_PATHS[key]}`;
    if (!keys.includes(key)) {
      // この入口では読まない値。間違って使ったら、空の値で動かずにすぐ分かるよう止める
      Object.defineProperty(config, key, {
        enumerable: false,
        get() {
          throw new Error(`入口 ${entry} では ${path} を読みません`);
        },
      });
      continue;
    }
    const value = byName.get(path);
    if (!value) throw new Error(`パラメータストアの値が空です: ${path}`);
    config[key] = value;
  }
  return config;
}

let cached: Promise<AppConfig> | undefined;

/** 起動のあと最初の呼び出しで読み、以後は同じ値を返す。失敗したら次の呼び出しで読み直す。 */
export function getConfig(): Promise<AppConfig> {
  if (!cached) {
    cached = loadConfig().catch((err: unknown) => {
      cached = undefined;
      throw err;
    });
  }
  return cached;
}

/** テスト用 */
export function resetConfigCache(): void {
  cached = undefined;
}
