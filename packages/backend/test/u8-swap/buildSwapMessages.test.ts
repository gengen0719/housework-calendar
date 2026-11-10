import { MESSAGES } from '@housework/shared';
import { describe, expect, it } from 'vitest';
import {
  buildAcceptMessages,
  buildListMessages,
  buildOfferMessages,
  buildWithdrawMessages,
} from '../../src/handlers/line/swapHandler';
import {
  LINE_LIMITS,
  buildSwapCarousel,
  buildSwapOfferMessage,
} from '../../src/services/lineApiService';
import {
  FAKE_U8_MARKER_LONG_CHORE_NAME,
  fakeU8DutyId,
  FAKE_U8_OFFER_ID_1,
} from '../fixtures/fakeSecrets';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const len = (text: string): number => Array.from(text).length;
const duty = { dutyId: fakeU8DutyId(1), date: '2027-01-08' };
const fail = (reason: string) => ({ ok: false as const, reason });

const choices = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    dutyId: fakeU8DutyId(i + 1),
    date: `2027-01-${String(i + 1).padStart(2, '0')}`,
    choreTypeId: 'c',
    choreName: i === 0 ? FAKE_U8_MARKER_LONG_CHORE_NAME : '皿洗い',
  }));

describe('buildListMessages（BR9.6）', () => {
  it('10 件以下は見出しと carousel だけ、11 件以上は案内が添えられて 3 通以内', () => {
    expect(buildListMessages(choices(10))).toHaveLength(2);
    const eleven = buildListMessages(choices(11));
    expect(eleven).toHaveLength(3);
    expect(((eleven[1] as Json).contents.contents as unknown[]).length).toBe(10);
    expect(eleven.length).toBeLessThanOrEqual(LINE_LIMITS.REPLY_MESSAGES_MAX);
  });
  it('理由の印は文だけになる', () => {
    expect(buildListMessages('NO_SWAPPABLE_DUTY')).toEqual([
      { type: 'text', text: MESSAGES.NO_SWAPPABLE_DUTY },
    ]);
    expect(buildListMessages('MONTH_CONFIRMED')).toEqual([
      { type: 'text', text: MESSAGES.MONTH_CONFIRMED },
    ]);
  });
});

describe('buildSwapCarousel／buildSwapOfferMessage の上限', () => {
  it('ボタンの文字・altText・値が上限以内で、バブルは 10 個以下', () => {
    const carousel = buildSwapCarousel(
      choices(10).map((c) => ({ dutyId: c.dutyId, dateLabel: '12/31', choreName: c.choreName })),
    ) as Json;
    expect(carousel.altText.length).toBeLessThanOrEqual(LINE_LIMITS.ALT_TEXT_MAX);
    for (const bubble of carousel.contents.contents as Json[]) {
      const action = bubble.footer.contents[0].action as Json;
      expect(len(action.label)).toBeLessThanOrEqual(LINE_LIMITS.FLEX_BUTTON_LABEL_MAX);
      expect(action.data.length).toBeLessThanOrEqual(LINE_LIMITS.POSTBACK_DATA_MAX);
      expect(bubble.footer.contents[0].height).toBe('md');
    }
  });
  it('知らせは 160 文字以内に収まり、ボタンの文字は 20 文字以内', () => {
    const message = buildSwapOfferMessage({
      text: 'あ'.repeat(500),
      dutyId: fakeU8DutyId(1),
      offerId: FAKE_U8_OFFER_ID_1,
    }) as Json;
    expect(len(message.template.text)).toBeLessThanOrEqual(LINE_LIMITS.TEMPLATE_BODY_MAX);
    expect(len(message.altText)).toBeLessThanOrEqual(LINE_LIMITS.ALT_TEXT_MAX);
    for (const action of message.template.actions as Json[]) {
      expect(len(action.label)).toBeLessThanOrEqual(LINE_LIMITS.TEMPLATE_BUTTON_LABEL_MAX);
      expect(action.data.length).toBeLessThanOrEqual(LINE_LIMITS.POSTBACK_DATA_MAX);
    }
  });
  it('名前の長い表示名と種類でも知らせの本文は上限以内', () => {
    const [message] = buildOfferMessages(
      { ok: true, offerId: FAKE_U8_OFFER_ID_1, duty, choreName: FAKE_U8_MARKER_LONG_CHORE_NAME },
      'あ'.repeat(100),
    ) as [Json];
    expect(len(message.template.text)).toBeLessThanOrEqual(LINE_LIMITS.TEMPLATE_BODY_MAX);
  });
});

const text = (messages: unknown[]): string => String((messages[0] as Json).text);

describe('結果の印と返事の対応（functional-spec）', () => {
  it('申し出', () => {
    const offered = (reason: string) => text(buildOfferMessages(fail(reason), '太郎'));
    expect(offered('ALREADY_OFFERED')).toBe(MESSAGES.ALREADY_OFFERED);
    expect(offered('OFFER_OWNER_ONLY')).toBe(MESSAGES.OFFER_OWNER_ONLY);
    expect(offered('MONTH_CONFIRMED')).toBe(MESSAGES.MONTH_CONFIRMED);
    for (const reason of ['NOT_FOUND', 'DUTY_NOT_TODO', 'DUTY_CHANGED']) {
      expect(offered(reason)).toBe(MESSAGES.DUTY_CHANGED);
    }
    expect(offered('INTERNAL')).toBe('うまく申し出られませんでした。もう一度お試しください');
  });
  it('引き受け', () => {
    const accepted = (reason: string) => text(buildAcceptMessages(fail(reason), '花子'));
    expect(accepted('OFFER_ALREADY_ACCEPTED')).toBe(MESSAGES.OFFER_ALREADY_ACCEPTED);
    expect(accepted('CANNOT_ACCEPT_OWN_OFFER')).toBe(MESSAGES.CANNOT_ACCEPT_OWN_OFFER);
    expect(accepted('OFFER_GONE')).toBe(MESSAGES.OFFER_GONE);
    expect(accepted('NOT_FOUND')).toBe(MESSAGES.OFFER_GONE);
    expect(accepted('INTERNAL')).toBe('うまく引き受けられませんでした。もう一度お試しください');
    expect(text(buildAcceptMessages({ ok: true, duty, choreName: '皿洗い' }, '花子'))).toBe(
      '花子が 1月8日 の皿洗いを引き受けました',
    );
  });
  it('取り下げ', () => {
    const withdrawn = (reason: string) => text(buildWithdrawMessages(fail(reason), '太郎'));
    expect(withdrawn('OFFER_GONE')).toBe(MESSAGES.OFFER_GONE);
    expect(withdrawn('OFFER_ALREADY_ACCEPTED')).toBe(MESSAGES.OFFER_ALREADY_ACCEPTED);
    expect(withdrawn('OFFER_OWNER_ONLY')).toBe(MESSAGES.OFFER_OWNER_ONLY);
    expect(withdrawn('INTERNAL')).toBe('うまく申し出られませんでした。もう一度お試しください');
    expect(text(buildWithdrawMessages({ ok: true, duty, choreName: '皿洗い' }, '太郎'))).toBe(
      '太郎が 1月8日 の皿洗いの申し出をやめました',
    );
  });
  it('名前が空なら言い換える', () => {
    expect(text(buildAcceptMessages({ ok: true, duty, choreName: '' }, ''))).toBe(
      'だれかが 1月8日 のお手伝いを引き受けました',
    );
  });
});
