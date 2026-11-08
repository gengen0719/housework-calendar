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

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`環境変数 ${name} が設定されていません`);
  return value;
}

export async function loadConfig(
  client: SSMClient = new SSMClient({}),
  prefix: string = requireEnv('SSM_PREFIX'),
): Promise<AppConfig> {
  const names = Object.values(PARAMETER_PATHS).map((path) => `${prefix}/${path}`);
  const response = await client.send(
    new GetParametersCommand({ Names: names, WithDecryption: true }),
  );
  if (response.InvalidParameters && response.InvalidParameters.length > 0) {
    // 値は含めず、パスだけを知らせる
    throw new Error(`パラメータストアに値がありません: ${response.InvalidParameters.join(', ')}`);
  }
  const byName = new Map((response.Parameters ?? []).map((p) => [p.Name, p.Value]));
  const config = {} as Record<keyof AppConfig, string>;
  for (const [key, path] of Object.entries(PARAMETER_PATHS) as [keyof AppConfig, string][]) {
    const value = byName.get(`${prefix}/${path}`);
    if (!value) throw new Error(`パラメータストアの値が空です: ${prefix}/${path}`);
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
