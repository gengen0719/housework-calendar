import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger, setRequestMetrics, takeRequestMetrics, type LogData } from '../../src/lib/logger';
import { REDACTED_MARKER } from '../fixtures/fakeSecrets';

describe('U5 のログ（種類の名前と子供の表示名を書かない。NFR2.32）', () => {
  let lines: string[];
  beforeEach(() => {
    lines = [];
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      lines.push(String(line));
    });
    takeRequestMetrics();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const lastLog = (): Record<string, unknown> =>
    JSON.parse(lines[lines.length - 1] as string) as Record<string, unknown>;

  it('型: 種類の名前（name）と子供の表示名（displayName）を渡すとコンパイルエラーになる', () => {
    // @ts-expect-error name は LogData で受け付けない
    const withName: LogData = { event: 'ASSIGNMENT_SAVED', name: '皿洗い' };
    // @ts-expect-error displayName は LogData で受け付けない
    const withDisplayName: LogData = { event: 'ASSIGNMENT_SAVED', displayName: '太郎' };
    const allowed: LogData = { event: 'ASSIGNMENT_SAVED', dutyCount: 5, month: '2027-01' };
    expect([withName, withDisplayName, allowed]).toHaveLength(3);
  });

  it('実行時: 型を迂回して name と displayName を渡しても値が伏せられる', () => {
    const data = { event: 'ASSIGNMENT_SAVED', name: 'ひみつの皿洗い', displayName: 'ひみつの太郎' };
    logger.info(data as unknown as LogData);
    expect(lastLog().name).toBe(REDACTED_MARKER);
    expect(lastLog().displayName).toBe(REDACTED_MARKER);
    expect(lines.join('')).not.toContain('ひみつ');
  });

  it('件数や月の項目は伏せない', () => {
    logger.info({
      event: 'ASSIGNMENT_SAVED',
      dutyCount: 5,
      created: 5,
      chunks: 1,
      month: '2027-01',
    });
    expect(lastLog()).toMatchObject({ dutyCount: 5, created: 5, chunks: 1, month: '2027-01' });
  });

  it('REQUEST_END に足す数字は、取り出すと空になる', () => {
    setRequestMetrics({ dutyCount: 7 });
    expect(takeRequestMetrics()).toMatchObject({ dutyCount: 7 });
    expect(takeRequestMetrics()).not.toHaveProperty('dutyCount');
  });

  it('coldStart は、実行環境の最初の要求だけ true になる', async () => {
    vi.resetModules();
    const fresh = await import('../../src/lib/logger');
    expect(fresh.takeRequestMetrics().coldStart).toBe(true);
    expect(fresh.takeRequestMetrics().coldStart).toBe(false);
  });

  it('数字は積み重なる（後から足した項目で前の項目を消さない）', () => {
    setRequestMetrics({ dutyCount: 2 });
    setRequestMetrics({});
    expect(takeRequestMetrics().dutyCount).toBe(2);
  });
});
