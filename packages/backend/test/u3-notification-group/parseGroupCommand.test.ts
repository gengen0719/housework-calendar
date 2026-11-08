import { describe, expect, it } from 'vitest';
import { isOneToOneRegisterRequest, parseGroupCommand } from '../../src/handlers/line/groupCommand';
import type { LineEvent } from '../../src/handlers/line/types';
import { messageEvent, postbackEvent } from './helpers/events';

const asEvent = (e: unknown): LineEvent => e as LineEvent;

describe('parseGroupCommand（NFR4.28）', () => {
  it('グループの「登録」は登録の操作（前後の空白は除く）', () => {
    expect(parseGroupCommand(asEvent(messageEvent('e1', '登録')))).toEqual({
      kind: 'registerNotificationGroup',
    });
    expect(parseGroupCommand(asEvent(messageEvent('e2', '\n 登録　')))).not.toBeNull();
  });

  it('似た文字は null（登録して、とうろく、登録 登録）', () => {
    for (const text of ['登録して', 'とうろく', '登録 登録', '', '登録!']) {
      expect(parseGroupCommand(asEvent(messageEvent('e3', text)))).toBeNull();
    }
  });

  it('5000 文字を超える文字は null、ちょうど 5000 文字で「登録」でなければ null', () => {
    expect(parseGroupCommand(asEvent(messageEvent('e4', `登録${' '.repeat(5000)}`)))).toBeNull();
    expect(parseGroupCommand(asEvent(messageEvent('e5', 'あ'.repeat(5000))))).toBeNull();
  });

  it('postback は action=group.register のときだけ登録の操作', () => {
    expect(parseGroupCommand(asEvent(postbackEvent('e6', 'action=group.register')))).not.toBeNull();
    expect(parseGroupCommand(asEvent(postbackEvent('e7', 'action=group.registerX')))).toBeNull();
    expect(parseGroupCommand(asEvent(postbackEvent('e8', 'act=group.register')))).toBeNull();
    expect(parseGroupCommand(asEvent(postbackEvent('e9', '')))).toBeNull();
  });

  it('postback の data が 300 文字を超えると null（300 文字ちょうどは読む）', () => {
    const base = 'action=group.register&x=';
    const exact = base + 'a'.repeat(300 - base.length);
    expect(exact).toHaveLength(300);
    expect(parseGroupCommand(asEvent(postbackEvent('e10', exact)))).not.toBeNull();
    expect(parseGroupCommand(asEvent(postbackEvent('e11', `${exact}a`)))).toBeNull();
  });

  it('文字以外の message・知らない種類のイベントは null', () => {
    const sticker = { ...messageEvent('e12', '登録'), message: { type: 'sticker' } };
    expect(parseGroupCommand(asEvent(sticker))).toBeNull();
    expect(parseGroupCommand({ type: 'join' })).toBeNull();
    expect(parseGroupCommand({ type: 'message' })).toBeNull();
  });

  it('グループ以外（1 対 1・room・source なし）は null。1 対 1 だけ別の判定で拾う', () => {
    const oneToOne = asEvent(messageEvent('e13', '登録', { kind: 'user' }));
    const room = asEvent(messageEvent('e14', '登録', { kind: 'room' }));
    expect(parseGroupCommand(oneToOne)).toBeNull();
    expect(parseGroupCommand(room)).toBeNull();
    expect(
      parseGroupCommand({ type: 'message', message: { type: 'text', text: '登録' } }),
    ).toBeNull();
    expect(isOneToOneRegisterRequest(oneToOne)).toBe(true);
    expect(isOneToOneRegisterRequest(room)).toBe(false);
    expect(
      isOneToOneRegisterRequest(asEvent(messageEvent('e15', 'こんにちは', { kind: 'user' }))),
    ).toBe(false);
  });

  it('1 対 1 のボタン（postback）も登録の操作として拾う', () => {
    const event = asEvent(postbackEvent('e16', 'action=group.register', { kind: 'user' }));
    expect(isOneToOneRegisterRequest(event)).toBe(true);
  });
});
