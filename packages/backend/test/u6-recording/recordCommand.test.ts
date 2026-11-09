import { describe, expect, it } from 'vitest';
import { MAX_RECORD_CHOICES, parseRecordCommand } from '../../src/handlers/line/recordCommand';
import type { LineEvent } from '../../src/handlers/line/types';
import { FAKE_DUTY_ID_1, FAKE_UPPERCASE_UUID } from '../fixtures/fakeSecrets';
import { recordDoPostback, recordListPostback, recordPostback } from './helpers/events';

const asEvent = (e: unknown): LineEvent => e as LineEvent;
const DUTY = FAKE_DUTY_ID_1;

describe('parseRecordCommand（NFR4.54、NFR4.55、ADR-U6-02）', () => {
  it('MAX_RECORD_CHOICES は 12（BR7.2 の仮定）', () => {
    expect(MAX_RECORD_CHOICES).toBe(12);
  });

  it('action=record.list（1 対 1・replyToken あり）は list', () => {
    expect(parseRecordCommand(asEvent(recordListPostback('e1')))).toEqual({ kind: 'list' });
  });

  it('action=record.do&dutyId=<小文字 UUID>&v=<整数> は do（dutyId と version を取り出す）', () => {
    expect(parseRecordCommand(asEvent(recordDoPostback('e2', DUTY, 3)))).toEqual({
      kind: 'do',
      dutyId: DUTY,
      version: 3,
    });
    // v=0 ちょうどは通る
    expect(parseRecordCommand(asEvent(recordDoPostback('e3', DUTY, 0)))).toEqual({
      kind: 'do',
      dutyId: DUTY,
      version: 0,
    });
  });

  it('グループ・room の postback は、同じ data でも null（NFR4.55）', () => {
    expect(parseRecordCommand(asEvent(recordListPostback('e4', { kind: 'group' })))).toBeNull();
    expect(parseRecordCommand(asEvent(recordListPostback('e5', { kind: 'room' })))).toBeNull();
    expect(
      parseRecordCommand(asEvent(recordDoPostback('e6', DUTY, 1, { kind: 'group' }))),
    ).toBeNull();
  });

  it('replyToken がないイベントは null（返事の宛先がないまま記録しない）', () => {
    expect(
      parseRecordCommand(asEvent(recordListPostback('e7', { noReplyToken: true }))),
    ).toBeNull();
    expect(
      parseRecordCommand(asEvent(recordDoPostback('e8', DUTY, 1, { noReplyToken: true }))),
    ).toBeNull();
  });

  it('大文字の UUID の dutyId は null', () => {
    const data = `action=record.do&dutyId=${FAKE_UPPERCASE_UUID.toLowerCase().replace(/[0-9a-f]/, 'A')}&v=1`;
    // 明示的に大文字を含む dutyId で確かめる
    expect(parseRecordCommand(asEvent(recordPostback('e9', data)))).toBeNull();
    expect(
      parseRecordCommand(
        asEvent(recordPostback('e10', `action=record.do&dutyId=${FAKE_UPPERCASE_UUID}&v=1`)),
      ),
    ).toBeNull();
  });

  it('v の形が外れる値はすべて null（先頭 0・小数・符号・指数・10 桁）', () => {
    for (const v of ['01', '1.5', '-1', '1e2', '1234567890']) {
      const data = `action=record.do&dutyId=${DUTY}&v=${v}`;
      expect(parseRecordCommand(asEvent(recordPostback(`e-${v}`, data)))).toBeNull();
    }
  });

  it('項目の重複・余分な項目・順番の違い・エンコードはすべて null', () => {
    const bad = [
      `action=record.do&dutyId=${DUTY}&v=1&dutyId=${DUTY}`, // 重複
      `action=record.do&dutyId=${DUTY}&v=1&x=1`, // 余分
      `action=record.do&v=1&dutyId=${DUTY}`, // 順番
      `action=record.list&extraKey=val`, // list に余分
      `action%3Drecord.list`, // % エンコード
      `action=record.do&dutyId=${DUTY}&v=%31`, // 値のエンコード
    ];
    for (const [i, data] of bad.entries()) {
      expect(parseRecordCommand(asEvent(recordPostback(`eb-${i}`, data)))).toBeNull();
    }
  });

  it('300 文字を超える data は null（長さは正規表現より先に見る）', () => {
    const data = `action=record.do&dutyId=${DUTY}&v=1${'&'.padEnd(301, 'x')}`;
    expect(data.length).toBeGreaterThan(300);
    expect(parseRecordCommand(asEvent(recordPostback('e-long', data)))).toBeNull();
  });

  it('data が undefined、知らない action、空の値は null', () => {
    expect(
      parseRecordCommand(
        asEvent({ type: 'postback', replyToken: 'r', source: { type: 'user', userId: 'U_x' } }),
      ),
    ).toBeNull();
    expect(parseRecordCommand(asEvent(recordPostback('e11', 'action=record.unknown')))).toBeNull();
    expect(parseRecordCommand(asEvent(recordPostback('e12', '')))).toBeNull();
    expect(
      parseRecordCommand(asEvent(recordPostback('e13', `action=record.do&dutyId=&v=1`))),
    ).toBeNull();
  });

  it('postback 以外のイベントは null', () => {
    expect(
      parseRecordCommand(asEvent({ type: 'message', source: { type: 'user' }, replyToken: 'r' })),
    ).toBeNull();
  });
});
