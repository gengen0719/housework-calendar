import { describe, expect, it } from 'vitest';
import { jstTimeOf } from '../../src/index';

describe('共有パッケージ: 日本時間の時刻（U6。BR7.11、NFR11.5、NFR11.6）', () => {
  it('UTC の秒単位の値から日本時間の HH:mm を返す（UTC 07:00 → 16:00）', () => {
    expect(jstTimeOf(new Date('2027-01-07T07:00:00.000Z'))).toBe('16:00');
    expect(jstTimeOf(new Date('2027-01-07T07:42:30.000Z'))).toBe('16:42');
  });

  it('文字列（UTC の ISO 8601）も受け取れる', () => {
    expect(jstTimeOf('2027-01-07T07:42:00.000Z')).toBe('16:42');
  });

  it('日本時間の 0 時 0 分と 23 時 59 分が正しく出る', () => {
    // JST 00:00 = UTC 15:00（前日）
    expect(jstTimeOf(new Date('2027-01-06T15:00:00.000Z'))).toBe('00:00');
    // JST 23:59 = UTC 14:59
    expect(jstTimeOf(new Date('2027-01-07T14:59:00.000Z'))).toBe('23:59');
  });

  it('日本時間の日付の境目（UTC 14:59 と 15:00）でも時刻だけを見る', () => {
    // UTC 14:59 → JST 23:59（同じ日本時間の日の終わり）
    expect(jstTimeOf(new Date('2027-01-07T14:59:00.000Z'))).toBe('23:59');
    // UTC 15:00 → JST 00:00（翌日の始まり）。時刻は 00:00
    expect(jstTimeOf(new Date('2027-01-07T15:00:00.000Z'))).toBe('00:00');
  });

  it('時と分は常に 2 桁（先頭 0 を付ける）', () => {
    // JST 09:05 = UTC 00:05
    expect(jstTimeOf(new Date('2027-01-07T00:05:00.000Z'))).toBe('09:05');
  });
});
