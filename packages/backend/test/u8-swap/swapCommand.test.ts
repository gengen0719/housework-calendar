import { describe, expect, it } from 'vitest';
import { parseSwapMessage, parseSwapPostback } from '../../src/handlers/line/swapCommand';
import type { LineEvent } from '../../src/handlers/line/types';
import { FAKE_U8_DUTY_ID_A, FAKE_U8_OFFER_ID_1 } from '../fixtures/fakeSecrets';
import { swapAcceptData, swapOfferData, swapWithdrawData } from '../../src/services/lineApiService';

const message = (text: string | undefined, sourceType = 'group', type = 'text'): LineEvent => ({
  type: 'message',
  replyToken: 'r',
  source: { type: sourceType },
  message: { type, ...(text === undefined ? {} : { text }) },
});
const postback = (data: string | undefined, sourceType = 'group', replyToken = 'r'): LineEvent => ({
  type: 'postback',
  ...(replyToken ? { replyToken } : {}),
  source: { type: sourceType },
  postback: data === undefined ? {} : { data },
});

describe('parseSwapMessage（BR9.1）', () => {
  it.each(['家事交代', ' 家事交代', '家事交代 ', '　家事交代　', '\n家事交代\n'])(
    '受け付ける: %j',
    (text) => {
      expect(parseSwapMessage(message(text))).toEqual({ kind: 'list' });
    },
  );
  it.each([
    '代わって',
    'かわって',
    '家事 交代',
    '家事交代して',
    '家事\u200b交代',
    '家事交代'.padEnd(5001, 'あ'),
    '',
  ])('受け付けない: %j', (text) => {
    expect(parseSwapMessage(message(text))).toBeNull();
  });
  it('text でない・本文なし・グループと 1 対 1 以外は受け付けない', () => {
    expect(parseSwapMessage(message('家事交代', 'group', 'sticker'))).toBeNull();
    expect(parseSwapMessage(message(undefined))).toBeNull();
    expect(parseSwapMessage(message('家事交代', 'room'))).toBeNull();
    expect(parseSwapMessage(message('家事交代', 'user'))).toEqual({ kind: 'list' });
  });
});

describe('parseSwapPostback（BR9.16）', () => {
  it('3 つの形を読む', () => {
    expect(parseSwapPostback(postback(swapOfferData(FAKE_U8_DUTY_ID_A)))).toEqual({
      kind: 'offer',
      dutyId: FAKE_U8_DUTY_ID_A,
    });
    expect(
      parseSwapPostback(postback(swapAcceptData(FAKE_U8_DUTY_ID_A, FAKE_U8_OFFER_ID_1))),
    ).toEqual({ kind: 'accept', dutyId: FAKE_U8_DUTY_ID_A, offerId: FAKE_U8_OFFER_ID_1 });
    expect(
      parseSwapPostback(postback(swapWithdrawData(FAKE_U8_DUTY_ID_A, FAKE_U8_OFFER_ID_1))),
    ).toEqual({ kind: 'withdraw', dutyId: FAKE_U8_DUTY_ID_A, offerId: FAKE_U8_OFFER_ID_1 });
  });
  it.each([
    ['項目の重複', `${swapOfferData(FAKE_U8_DUTY_ID_A)}&dutyId=${FAKE_U8_DUTY_ID_A}`],
    ['順序違い', `dutyId=${FAKE_U8_DUTY_ID_A}&action=swap.offer`],
    ['エンコード違い', `action%3Dswap.offer&dutyId=${FAKE_U8_DUTY_ID_A}`],
    ['大文字の ID', swapOfferData(FAKE_U8_DUTY_ID_A.toUpperCase())],
    ['余分な項目', `${swapOfferData(FAKE_U8_DUTY_ID_A)}&x=1`],
    ['前後の空白', ` ${swapOfferData(FAKE_U8_DUTY_ID_A)}`],
    ['末尾の改行', `${swapOfferData(FAKE_U8_DUTY_ID_A)}\n`],
    ['300 文字超', `${swapOfferData(FAKE_U8_DUTY_ID_A)}&x=${'a'.repeat(300)}`],
    ['引き受けに offerId なし', `action=swap.accept&dutyId=${FAKE_U8_DUTY_ID_A}`],
  ])('外れる: %s', (_name, data) => {
    expect(parseSwapPostback(postback(data))).toBeNull();
  });
  it('1 対 1・ルーム・replyToken なし・data なしは読まない', () => {
    const data = swapOfferData(FAKE_U8_DUTY_ID_A);
    expect(parseSwapPostback(postback(data, 'user'))).toBeNull();
    expect(parseSwapPostback(postback(data, 'room'))).toBeNull();
    expect(parseSwapPostback(postback(data, 'group', ''))).toBeNull();
    expect(parseSwapPostback(postback(undefined))).toBeNull();
  });
  it('一番長い data も 300 文字以内である', () => {
    expect(swapAcceptData(FAKE_U8_DUTY_ID_A, FAKE_U8_OFFER_ID_1).length).toBeLessThanOrEqual(300);
    expect(swapWithdrawData(FAKE_U8_DUTY_ID_A, FAKE_U8_OFFER_ID_1).length).toBeLessThanOrEqual(300);
  });
});
