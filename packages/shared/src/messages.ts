import { isReason, type Reason } from './reasons';

/**
 * 理由の印 → 文言（契約 C10）。画面と LINE のトークの受け口の両方が引く。
 * 要件（requirements.md）の書き方をそのまま使う。
 */
export const MESSAGES: Record<Reason, string> = {
  UNAUTHENTICATED: 'ログインし直してください',
  NOT_FAMILY_MEMBER: 'このアプリは家族のメンバーだけが使えます',
  ADMIN_ONLY: 'この操作ができるのは管理者だけです',
  NOT_FOUND: '見つかりませんでした',
  INTERNAL: '表示できませんでした。もう一度お試しください',
  ALREADY_IN_FAMILY: 'すでに家族に入っています',
  ALREADY_IN_OTHER_FAMILY: 'すでに別の家族に入っています',
  INVITATION_INVALID: 'この招待は使えません。管理者に新しい招待を頼んでください',
  NOTIFICATION_GROUP_NOT_REGISTERED: 'お知らせ先のグループが登録されていません',
  GROUP_NOT_REGISTERED: 'このグループは家族のお知らせ先として登録されていません',
  INVALID_UNIT_PRICE: '単価は 0 円以上の整数で入力してください',
  CHORE_TYPE_IN_USE: 'この種類は割り当てに使われているため消せません',
  CHORE_TYPE_INACTIVE: '使わない種類は割り当てられません',
  ASSIGNMENT_OVERLAP: '同じ日の同じお手伝いに担当が 2 人います',
  OVERWRITE_CONFIRMATION_REQUIRED: '変わる担当を確認してください',
  MONTH_CONFIRMED: 'この月は確定済みです',
  DUTY_NOT_TODO: '記録を取り消してから変更してください',
  NO_RECORDABLE_DUTY: '今日記録できる担当はありません',
  NOT_OWN_DUTY: '自分の担当ではありません',
  FUTURE_DUTY: 'まだ来ていない日の担当は記録できません',
  DUTY_SKIPPED_BY_ADMIN: 'お母さんが『やらなかった』にしています',
  INVALID_TRANSITION: '今の状態からはその操作はできません',
  NO_SWAPPABLE_DUTY: '申し出られる担当はありません',
  ALREADY_OFFERED: 'この担当はもう申し出ています',
  OFFER_ALREADY_ACCEPTED: 'この申し出はもう引き受けられています',
  OFFER_GONE: 'この申し出はもうありません',
  CANNOT_ACCEPT_OWN_OFFER: 'この申し出には応えられません',
  REASON_REQUIRED: '理由を入力してください',
  INVALID_AMOUNT: '金額は 1 円以上の整数で入力してください',
  NOT_FRIEND: 'このアプリを使うには、公式アカウントを友だち追加してください',
  INVALID_FAMILY_NAME: '家族の名前を 1〜20 文字で入力してください',
  IDEMPOTENCY_KEY_REQUIRED: '操作の識別子が正しくありません。もう一度お試しください',
  SERVICE_TEMPORARILY_UNAVAILABLE: '表示できませんでした。もう一度お試しください',
  IDEMPOTENCY_KEY_REUSED: '操作の識別子が正しくありません。もう一度お試しください',
  GROUP_USED_BY_OTHER_FAMILY: 'このグループはほかの家族のお知らせ先になっています',
};

/** LINE のグループへの返事の文言（理由の印ではない。U3）。 */
export const NOTIFICATION_GROUP_ADMIN_ONLY = 'お知らせ先を登録できるのは管理者だけです';

export const GROUP_JOIN_GUIDE =
  '公式アカウントを招待してくれてありがとうございます。管理者の方が下のボタンを押すと、このグループが家族のお知らせ先になります。ボタンが見えなくなったら『登録』と送ってください';

export const GROUP_REGISTER_BUTTON = 'このグループをお知らせ先にする';

export function NOTIFICATION_GROUP_REGISTERED(familyName: string): string {
  return `このグループを${familyName}のお知らせ先にしました。毎日 16 時のリマインドと、月末のまとめがここに届きます`;
}

/** カレンダーの枠の画面に出す手順（BR4.11）。 */
export const NOTIFICATION_GROUP_HOWTO =
  '公式アカウントを家族のグループ LINE に招待し、届いたボタンを押してください';

export const GROUP_REGISTER_IN_GROUP_ONLY =
  'お知らせ先の登録は、家族のグループ LINE の中で行ってください';

/** 画面だけで使う文言（理由の印ではない。U2）。 */
export const INVITATION_NOT_FRIEND_HINT = '友だち登録したら、もう一度このリンクを開いてください';

/** 「LINE で送る」で送る文。期限は日本時間で整形した文字を渡す。 */
export function INVITATION_SHARE_TEXT(input: {
  familyName: string;
  expiresAtText: string;
  url: string;
}): string {
  return `${input.familyName}の家事カレンダーに招待します。\n${input.expiresAtText}まで使えます。\n${input.url}`;
}

/** 理由の印から文言を引く。未知の印には INTERNAL の文言を返す。 */
export function getMessage(reason: string): string {
  return isReason(reason) ? MESSAGES[reason] : MESSAGES.INTERNAL;
}
