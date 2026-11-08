import type { LineEvent } from './types';

/** グループの操作（U3 は登録だけ。U8 が足す）。 */
export type GroupCommand = { kind: 'registerNotificationGroup' };

export const REGISTER_POSTBACK_ACTION = 'group.register';
export const REGISTER_KEYWORD = '登録';
export const POSTBACK_DATA_MAX_LENGTH = 300;
export const MESSAGE_TEXT_MAX_LENGTH = 5000;

/** 登録の操作にあたるか（送られた場所は見ない）。ちょうど一致のときだけ。長すぎる値は何もしない。 */
function isRegisterRequest(event: LineEvent): boolean {
  if (event.type === 'postback') {
    const data = event.postback?.data;
    if (data === undefined || data.length > POSTBACK_DATA_MAX_LENGTH) return false;
    return new URLSearchParams(data).get('action') === REGISTER_POSTBACK_ACTION;
  }
  if (event.type === 'message') {
    if (event.message?.type !== 'text') return false;
    const text = event.message.text;
    if (text === undefined || text.length > MESSAGE_TEXT_MAX_LENGTH) return false;
    return text.trim() === REGISTER_KEYWORD;
  }
  return false;
}

/**
 * グループ（source.type が group）に届いた message・postback を、グループの操作として読む（NFR4.28）。
 * どれにも合わなければ null（何もしない）。
 */
export function parseGroupCommand(event: LineEvent): GroupCommand | null {
  if (event.source?.type !== 'group') return null;
  return isRegisterRequest(event) ? { kind: 'registerNotificationGroup' } : null;
}

/** 1 対 1 のトーク（source.type が user）に届いた登録の操作か（BR4.13。案内を返す）。 */
export function isOneToOneRegisterRequest(event: LineEvent): boolean {
  return event.source?.type === 'user' && isRegisterRequest(event);
}
