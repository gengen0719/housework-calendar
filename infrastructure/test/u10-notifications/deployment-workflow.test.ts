import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/** 実際の配備ステップをシェルで展開し、npxを差し替えて引数だけ検査する。 */
function contexts(environment: string, variables: Record<string, string>) {
  const yaml = readFileSync(`.github/workflows/deploy-${environment}.yml`, 'utf8');
  const step = yaml.split('      - name: 反映\n')[1]!.split('\n      - name:')[0]!;
  const command = step
    .split('        run: >\n')[1]!
    .split('\n        env:')[0]!
    .split('\n')
    .map((line) => line.trim())
    .join(' ');
  const env: Record<string, string> = {};
  for (const match of step.matchAll(/^ {10}(\w+): \$\{\{ vars\.(\w+) \}\}/gm))
    env[match[1]!] = variables[match[2]!] ?? '';
  const args = execFileSync('bash', ['-c', `npx() { printf '%s\\n' "$@"; }; ${command}`], {
    env,
    encoding: 'utf8',
  })
    .trim()
    .split('\n');
  const result: Record<string, string> = {};
  args.forEach((arg, index) => {
    if (arg === '-c') {
      const value = args[index + 1]!;
      const split = value.indexOf('=');
      result[value.slice(0, split)] = value.slice(split + 1);
    }
  });
  return result;
}

describe.each(['staging', 'production'])('%s配備の通知設定', (environment) => {
  it('通知・復元・メール・確認・合算見積りを対応するCDK contextへ渡す', () => {
    const prefix = environment.toUpperCase();
    const result = contexts(environment, {
      [`${prefix}_NOTIFICATIONS_ENABLED`]: 'true',
      [`${prefix}_BACKUPS_ENABLED`]: 'false',
      [`${prefix}_NOTIFICATION_EMAIL`]: 'operator+alerts@example.com',
      [`${prefix}_NOTIFICATION_CHECKS_PASSED`]: 'true',
      [`${prefix}_NOTIFICATION_BUDGET_VERIFIED`]: 'true',
      NOTIFICATION_TOTAL_ESTIMATED_JPY: '91',
    });
    expect(result).toMatchObject({
      [`${environment}NotificationsEnabled`]: 'true',
      [`${environment}BackupsEnabled`]: 'false',
      [`${environment}NotificationEmail`]: 'operator+alerts@example.com',
      [`${environment}NotificationChecksPassed`]: 'true',
      [`${environment}NotificationBudgetVerified`]: 'true',
      [`${environment}NotificationEstimatedJpy`]: '91',
    });
  });
  it('未設定なら有効化しない', () => {
    expect(contexts(environment, {})).toMatchObject({
      [`${environment}NotificationsEnabled`]: 'false',
      [`${environment}BackupsEnabled`]: '',
      [`${environment}NotificationChecksPassed`]: 'false',
      [`${environment}NotificationBudgetVerified`]: 'false',
    });
  });
  it('通知を無効のままバックアップだけ有効化できる', () => {
    expect(
      contexts(environment, {
        [`${environment.toUpperCase()}_BACKUPS_ENABLED`]: 'true',
      }),
    ).toMatchObject({
      [`${environment}NotificationsEnabled`]: 'false',
      [`${environment}BackupsEnabled`]: 'true',
    });
  });
});
