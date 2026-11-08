export const REGION = 'ap-northeast-1';

export type EnvName = 'staging' | 'production';

export const ENV_NAMES: readonly EnvName[] = ['staging', 'production'];

/** パラメータストアのパスの先頭（環境ごとに分ける。NFR5.3、NFR10.1） */
export function ssmPrefix(envName: EnvName): string {
  return `/housework-calendar/${envName}`;
}
