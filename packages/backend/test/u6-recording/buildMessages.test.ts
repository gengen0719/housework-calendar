import { describe, expect, it } from 'vitest';
import { buildListMessages, buildDoMessages } from '../../src/handlers/line/recordHandler';
import type { RecordResult, TodayRecordableList } from '../../src/services/recordingService';
import type { DutyRecord } from '../../src/models';
import { FAMILY_ID } from '../u2-invitation/helpers/seed';
import {
  FAKE_U6_DUTY_ID_A,
  FAKE_CHORE_TYPE_ID_1,
  FAKE_CHILD_USER_ID_1,
} from '../fixtures/fakeSecrets';

interface TextMessage {
  type: string;
  text?: string;
}

const textsOf = (messages: unknown[]): string[] =>
  (messages as TextMessage[]).filter((m) => m.type === 'text').map((m) => m.text ?? '');
const flexCount = (messages: unknown[]): number =>
  (messages as TextMessage[]).filter((m) => m.type === 'flex').length;

const recordedDuty: DutyRecord = {
  dutyId: FAKE_U6_DUTY_ID_A,
  familyId: FAMILY_ID,
  month: '2027-01',
  date: '2027-01-07',
  choreTypeId: FAKE_CHORE_TYPE_ID_1,
  childUserId: FAKE_CHILD_USER_ID_1,
  status: 'done',
  origin: 'rule',
  version: 2,
  createdAt: '2026-12-20T00:00:00.000Z',
  updatedAt: '2027-01-07T07:42:00.000Z',
  recordedAt: '2027-01-07T07:42:00.000Z',
  recordedBy: FAKE_CHILD_USER_ID_1,
  unitPrice: 100,
};
const names = new Map([[FAKE_CHORE_TYPE_ID_1, '皿洗い']]);
const emptyList = async (): Promise<TodayRecordableList> => ({ selectable: [], notSelectable: [] });
const oneChoice = async (): Promise<TodayRecordableList> => ({
  selectable: [
    {
      dutyId: FAKE_U6_DUTY_ID_A,
      choreTypeId: FAKE_CHORE_TYPE_ID_1,
      choreName: '皿洗い',
      version: 2,
    },
  ],
  notSelectable: [],
});

describe('buildListMessages（BR7.2）', () => {
  it('MONTH_CONFIRMED は確定済みの文 1 つ', () => {
    expect(textsOf(buildListMessages('MONTH_CONFIRMED'))).toEqual(['この月は確定済みです']);
  });

  it('selectable が 0 件・notSelectable も空は案内文だけ', () => {
    const messages = buildListMessages({ selectable: [], notSelectable: [] });
    expect(textsOf(messages)).toEqual(['今日記録できる担当はありません']);
    expect(flexCount(messages)).toBe(0);
  });

  it('selectable が 0 件でも「済」があれば案内文と選べない並びが出る', () => {
    const messages = buildListMessages({
      selectable: [],
      notSelectable: [{ choreName: '皿洗い', status: 'done', recordedTime: '16:42' }],
    });
    const body = textsOf(messages).join('\n');
    expect(body).toContain('今日記録できる担当はありません');
    expect(body).toContain('皿洗い（済 16:42）');
  });

  it('selectable があれば見出しと carousel が出る', () => {
    const messages = buildListMessages({
      selectable: [
        {
          dutyId: FAKE_U6_DUTY_ID_A,
          choreTypeId: FAKE_CHORE_TYPE_ID_1,
          choreName: '皿洗い',
          version: 1,
        },
      ],
      notSelectable: [{ choreName: '掃除機', status: 'skipped' }],
    });
    expect(textsOf(messages)).toContain('どのお手伝いを記録しますか');
    expect(flexCount(messages)).toBe(1);
    expect(textsOf(messages).join('\n')).toContain('掃除機（×）');
  });
});

describe('buildDoMessages（functional-spec の印と返事の対応）', () => {
  it('成功は「{お手伝い}を記録しました（{時:分}）」', async () => {
    const result: RecordResult = { ok: true, duty: recordedDuty, alreadyRecorded: false };
    const messages = await buildDoMessages(result, names, emptyList);
    expect(textsOf(messages)).toEqual(['皿洗いを記録しました（16:42）']);
  });

  it('INTERNAL は記録失敗の文だけ（出し直しなし）', async () => {
    const messages = await buildDoMessages({ ok: false, reason: 'INTERNAL' }, names, oneChoice);
    expect(textsOf(messages)).toEqual(['うまく記録できませんでした。もう一度お試しください']);
    expect(flexCount(messages)).toBe(0);
  });

  it('MONTH_CONFIRMED は確定済みの文だけ（出し直しなし）', async () => {
    const messages = await buildDoMessages(
      { ok: false, reason: 'MONTH_CONFIRMED' },
      names,
      oneChoice,
    );
    expect(textsOf(messages)).toEqual(['この月は確定済みです']);
  });

  it('DUTY_CHANGED は「先に変更されました」と出し直しの選択肢', async () => {
    const messages = await buildDoMessages({ ok: false, reason: 'DUTY_CHANGED' }, names, oneChoice);
    expect(textsOf(messages)[0]).toBe('この担当は先に変更されました');
    expect(flexCount(messages)).toBe(1);
  });

  it('DUTY_ALREADY_DONE は「すでに済です」と出し直し', async () => {
    const messages = await buildDoMessages(
      { ok: false, reason: 'DUTY_ALREADY_DONE' },
      names,
      oneChoice,
    );
    expect(textsOf(messages)[0]).toBe('この担当はすでに『済』になっています');
  });

  it('FUTURE_DUTY は「まだ来ていない日」と出し直し', async () => {
    const messages = await buildDoMessages({ ok: false, reason: 'FUTURE_DUTY' }, names, oneChoice);
    expect(textsOf(messages)[0]).toBe('まだ来ていない日の担当は記録できません');
  });

  it('出し直しで記録できる担当がなければ NO_RECORDABLE_DUTY の返事だけ', async () => {
    const messages = await buildDoMessages({ ok: false, reason: 'DUTY_CHANGED' }, names, emptyList);
    expect(textsOf(messages)).toEqual(['今日記録できる担当はありません']);
  });
});
