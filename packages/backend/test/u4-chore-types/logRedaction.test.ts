import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger, type LogData } from '../../src/lib/logger';
import { REDACTED_MARKER } from '../fixtures/fakeSecrets';

describe('ログの伏せ字と型（NFR2.27、レビュー R-05）', () => {
  let lines: string[];
  beforeEach(() => {
    lines = [];
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      lines.push(String(line));
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const lastLog = (): Record<string, unknown> =>
    JSON.parse(lines[lines.length - 1] as string) as Record<string, unknown>;

  it('実行時: name と description は値が伏せられる（大文字小文字を区別しない）', () => {
    // 型で禁止している項目を、型を迂回して渡した場合でも、実行時に伏せる
    const data = { event: 'X', name: 'ひみつの皿洗い', Description: 'ひみつの説明' };
    logger.info(data as unknown as LogData);
    const logged = lastLog();
    expect(logged.name).toBe(REDACTED_MARKER);
    expect(logged.Description).toBe(REDACTED_MARKER);
    expect(lines.join('')).not.toContain('ひみつ');
  });

  it('実行時: 入れ子の中の name も伏せる', () => {
    logger.info({ event: 'X', detail: { name: 'ひみつの皿洗い', unitPrice: 100 } });
    expect(lastLog().detail).toEqual({ name: REDACTED_MARKER, unitPrice: 100 });
  });

  it('名前が「name」「description」を含むだけの項目は伏せない（完全一致だけ）', () => {
    logger.info({ event: 'X', nameChanged: true, descriptionLength: 7 });
    const logged = lastLog();
    expect(logged.nameChanged).toBe(true);
    expect(logged.descriptionLength).toBe(7);
  });

  it('U1〜U3 で伏せていた項目は今までどおり伏せる', () => {
    logger.info({ event: 'X', safe: 1 });
    const data = { groupName: '山田家のグループ', text: 'こんにちは', display_name: '花子' };
    logger.info(data as unknown as LogData);
    const logged = lastLog();
    expect(logged.groupName).toBe(REDACTED_MARKER);
    expect(logged.text).toBe(REDACTED_MARKER);
    expect(logged.display_name).toBe(REDACTED_MARKER);
  });

  it('型: name と description を渡すとコンパイルエラーになる', () => {
    // @ts-expect-error name は LogData で受け付けない
    const withName: LogData = { event: 'X', name: '皿洗い' };
    // @ts-expect-error description は LogData で受け付けない
    const withDescription: LogData = { event: 'X', description: '説明' };
    // 受け付ける項目はコンパイルを通る
    const allowed: LogData = { event: 'X', choreTypeId: 'id-1', unitPrice: 100 };
    expect([withName, withDescription, allowed]).toHaveLength(3);
  });

  it('U1〜U3 のコードは、ログに name という項目を渡していない', () => {
    const root = join(__dirname, '../../src');
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith('.ts')) files.push(path);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(10);
    const callPattern = /logger\.(?:info|warn|error)\(\{[\s\S]*?\}\);/g;
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const call of source.match(callPattern) ?? []) {
        expect(call, `${file} のログの項目に name・description がある`).not.toMatch(
          /\b(?:name|description)\s*[:,}]/,
        );
      }
    }
  });
});
