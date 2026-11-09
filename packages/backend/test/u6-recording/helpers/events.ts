/** U6（記録）のテストで使う、LINE の Webhook のイベントの作り方（LINE の形どおり）。 */

export const CHILD_LINE_ID = 'U_taro';
export const ADMIN_LINE_ID = 'U_mother';
export const GROUP_ID = 'C_group_1';
export const ROOM_ID = 'R_room_1';

type SourceKind = 'user' | 'group' | 'room';

function source(kind: SourceKind, lineUserId: string | undefined) {
  return {
    type: kind,
    ...(lineUserId === undefined ? {} : { userId: lineUserId }),
    ...(kind === 'group' ? { groupId: GROUP_ID } : {}),
    ...(kind === 'room' ? { roomId: ROOM_ID } : {}),
  };
}

export interface RecordEventOptions {
  kind?: SourceKind;
  lineUserId?: string | undefined;
  timestamp?: number;
  /** replyToken を外す（「返事の宛先がないイベントは受け付けない」の確認用） */
  noReplyToken?: boolean;
}

/** 記録の postback イベント（既定は 1 対 1 の子供から）。 */
export function recordPostback(
  webhookEventId: string,
  data: string,
  options: RecordEventOptions = {},
) {
  return {
    type: 'postback',
    webhookEventId,
    ...(options.noReplyToken ? {} : { replyToken: `reply-${webhookEventId}` }),
    source: source(
      options.kind ?? 'user',
      'lineUserId' in options ? options.lineUserId : CHILD_LINE_ID,
    ),
    timestamp: options.timestamp ?? 1_700_000_000_000,
    mode: 'active',
    postback: { data },
  };
}

/** リッチメニューの「やった」（action=record.list）。 */
export function recordListPostback(webhookEventId: string, options: RecordEventOptions = {}) {
  return recordPostback(webhookEventId, 'action=record.list', options);
}

/** 担当の選択肢のボタン（action=record.do&dutyId=<ID>&v=<version>）。 */
export function recordDoPostback(
  webhookEventId: string,
  dutyId: string,
  version: number,
  options: RecordEventOptions = {},
) {
  return recordPostback(webhookEventId, `action=record.do&dutyId=${dutyId}&v=${version}`, options);
}
