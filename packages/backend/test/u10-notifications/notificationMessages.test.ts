import { describe, expect, it } from 'vitest';
import {
  buildDailyMessage,
  buildSummaryMessage,
  normalizeName,
  checkMessage,
} from '../../src/services/notificationMessages';
describe('通知本文', () => {
  it('名前の改行や制御文字を区切りにしない', () => {
    expect(normalizeName('太郎\r\n 花子\t')).toBe('太郎 花子');
  });
  it('日付と全状態を残す', () => {
    for (const status of ['todo', 'done', 'skipped'] as const) {
      expect(
        buildDailyMessage(
          '2027-01-31',
          [{ dutyId: 'a', choreTypeId: 'c', choreName: '皿洗い', displayName: '太郎', status }],
          'https://example.com/app',
        ),
      ).toContain({ todo: '未', done: '済', skipped: '×' }[status]);
    }
  });
  it('同名の担当をまとめない', () => {
    expect(
      buildDailyMessage(
        '2027-01-31',
        [
          { dutyId: 'a', choreTypeId: 'a', choreName: '洗い', displayName: '太郎', status: 'todo' },
          { dutyId: 'b', choreTypeId: 'b', choreName: '洗い', displayName: '太郎', status: 'todo' },
        ],
        'https://example.com/app',
      ).split('\n'),
    ).toEqual([
      '今日のお手伝い 2027-01-31',
      '洗い・太郎・未',
      '洗い・太郎・未',
      '',
      'https://example.com/app',
    ]);
  });
  it('0円と負の合計はそのまま', () => {
    expect(
      buildSummaryMessage('2027-01', [
        { displayName: '太郎', total: 0 },
        { displayName: '花子', total: -200 },
      ]),
    ).toContain('太郎 0円\n花子 -200円');
  });
  it('桁を区切る', () => {
    expect(buildSummaryMessage('2027-01', [{ displayName: '太郎', total: 1400 }])).toContain(
      '1,400円',
    );
  });
  it('上限ちょうどは送信できる', () => {
    expect(checkMessage('a'.repeat(5000))).toHaveLength(5000);
  });
  it('上限超過は省略や分割をせず失敗', () => {
    expect(() => checkMessage('a'.repeat(5001))).toThrow('oversize');
  });
  it('担当IDで安定的に並べる', () => {
    expect(
      buildDailyMessage(
        '2027-01-31',
        [
          { dutyId: 'b', choreTypeId: 'b', choreName: '後', displayName: '太郎', status: 'todo' },
          { dutyId: 'a', choreTypeId: 'a', choreName: '先', displayName: '花子', status: 'todo' },
        ],
        'https://example.com/app',
      ),
    ).toMatch(/先.*\n後/);
  });
});
