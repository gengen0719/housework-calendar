/** U3 のテストで使う、LINE の Webhook のイベントの作り方（LINE の形どおり）。 */

export const GROUP_ID = 'C_group_1';
export const ROOM_ID = 'R_room_1';
export const MOTHER_LINE_ID = 'U_mother';

type SourceKind = 'group' | 'room' | 'user';

function source(kind: SourceKind, lineUserId: string | undefined) {
  return {
    type: kind,
    ...(lineUserId === undefined ? {} : { userId: lineUserId }),
    ...(kind === 'group' ? { groupId: GROUP_ID } : {}),
    ...(kind === 'room' ? { roomId: ROOM_ID } : {}),
  };
}

export interface EventOptions {
  kind?: SourceKind;
  lineUserId?: string | undefined;
  timestamp?: number;
}

export function messageEvent(webhookEventId: string, text: string, options: EventOptions = {}) {
  return {
    type: 'message',
    webhookEventId,
    replyToken: `reply-${webhookEventId}`,
    source: source(
      options.kind ?? 'group',
      'lineUserId' in options ? options.lineUserId : MOTHER_LINE_ID,
    ),
    timestamp: options.timestamp ?? 1_700_000_000_000,
    mode: 'active',
    message: { type: 'text', id: `m-${webhookEventId}`, text },
  };
}

export function postbackEvent(webhookEventId: string, data: string, options: EventOptions = {}) {
  return {
    type: 'postback',
    webhookEventId,
    replyToken: `reply-${webhookEventId}`,
    source: source(
      options.kind ?? 'group',
      'lineUserId' in options ? options.lineUserId : MOTHER_LINE_ID,
    ),
    timestamp: options.timestamp ?? 1_700_000_000_000,
    mode: 'active',
    postback: { data },
  };
}

export function joinEvent(webhookEventId: string, options: EventOptions = {}) {
  return {
    type: 'join',
    webhookEventId,
    replyToken: `reply-${webhookEventId}`,
    source: source(options.kind ?? 'group', undefined),
    timestamp: options.timestamp ?? 1_700_000_000_000,
    mode: 'active',
  };
}

export function leaveEvent(webhookEventId: string, options: EventOptions = {}) {
  return {
    type: 'leave',
    webhookEventId,
    source: source(options.kind ?? 'group', undefined),
    timestamp: options.timestamp ?? 1_700_000_000_000,
    mode: 'active',
  };
}
