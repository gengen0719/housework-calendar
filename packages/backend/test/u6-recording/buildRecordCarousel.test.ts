import { describe, expect, it } from 'vitest';
import { buildRecordCarousel, recordDoData } from '../../src/services/lineApiService';
import { FAKE_DUTY_ID_1, FAKE_DUTY_ID_2 } from '../fixtures/fakeSecrets';

/** carousel の中身の型（確かめ用。内部の形だけを見る） */
interface Carousel {
  type: string;
  altText: string;
  contents: { type: string; contents: unknown[] };
}

const choices = [
  { dutyId: FAKE_DUTY_ID_1, choreName: '皿洗い', version: 1 },
  { dutyId: FAKE_DUTY_ID_2, choreName: '洗濯物たたみ', version: 5 },
];

describe('buildRecordCarousel / recordDoData（BR7.2、BR7.3、NFR4.54）', () => {
  it('バブルの数は渡した担当の数', () => {
    const flex = buildRecordCarousel(choices) as unknown as Carousel;
    expect(flex.type).toBe('flex');
    expect(flex.contents.type).toBe('carousel');
    expect(flex.contents.contents).toHaveLength(2);
  });

  it('altText が必ず付く（LINE の必須。SDK は使わない）', () => {
    const flex = buildRecordCarousel(choices) as unknown as Carousel;
    expect(typeof flex.altText).toBe('string');
    expect(flex.altText.length).toBeGreaterThan(0);
  });

  it('1 件のときは 1 個のバブル', () => {
    const flex = buildRecordCarousel([choices[0]!]) as unknown as Carousel;
    expect(flex.contents.contents).toHaveLength(1);
  });

  it('0 件のときは空の carousel', () => {
    const flex = buildRecordCarousel([]) as unknown as Carousel;
    expect(flex.contents.contents).toHaveLength(0);
  });

  it('ボタンの値は parseRecordCommand が通す形（action=record.do&dutyId=<小文字 UUID>&v=<整数>）', () => {
    expect(recordDoData(FAKE_DUTY_ID_1, 1)).toBe(`action=record.do&dutyId=${FAKE_DUTY_ID_1}&v=1`);
    const data = recordDoData(FAKE_DUTY_ID_2, 5);
    const re =
      /^action=record\.do&dutyId=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}&v=(0|[1-9][0-9]{0,8})$/;
    expect(re.test(data)).toBe(true);
  });

  it('各バブルのボタンは record.do の postback で、見せた version を持つ', () => {
    const flex = buildRecordCarousel(choices) as unknown as Carousel;
    const bubble = flex.contents.contents[1] as {
      footer: { contents: { action: { type: string; data: string } }[] };
    };
    const action = bubble.footer.contents[0]!.action;
    expect(action.type).toBe('postback');
    expect(action.data).toBe(recordDoData(FAKE_DUTY_ID_2, 5));
  });
});
