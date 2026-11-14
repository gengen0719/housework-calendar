import { weekdayOf } from './jstDate';
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
  CHORE_TYPE_IN_USE: '割り当てに使われたことがあるので消せません。『使わない』にしてください',
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
  INVALID_CHORE_TYPE_NAME: '名前を 1〜20 文字で入力してください',
  CHORE_TYPE_NAME_TAKEN:
    '同じ名前の種類があります。1 日に 2 回以上あるお手伝いは『皿洗い（追加分）』のように、別の名前で登録してください',
  INVALID_DESCRIPTION: '説明は 100 文字までで入力してください',
  INVALID_REQUEST: '操作の内容が正しくありません。もう一度お試しください',
  CHORE_TYPE_STATE_CHANGED: '状態が変わりました。もう一度お試しください',
  INVALID_MONTH: '月の指定が正しくありません',
  INVALID_ASSIGNMENT: '割り当ての入力に誤りがあります',
  MONTH_NOT_EDITABLE: '割り当てを入力できるのは今月と来月だけです',
  PAYLOAD_TOO_LARGE: '送る内容が大きすぎます',
  // U6 で足した印
  DUTY_CHANGED: 'この担当は先に変更されました',
  DUTY_ALREADY_DONE: 'この担当はすでに『済』になっています',
  // NOT_TODAY_DUTY は LINE の中だけで使う。返事は DUTY_CHANGED と同じ文言（functional-spec の表）
  NOT_TODAY_DUTY: 'この担当は先に変更されました',
  ADMIN_RECORD_GUIDE: 'お手伝いの記録は子供のメニューです。記録の修正は画面からできます',
  JOIN_FAMILY_FIRST: '先に家族に参加してください',
  // U8 で足した印
  OFFER_OWNER_ONLY: 'この操作は申し出た人だけができます',
};

/** カレンダーと割り当ての画面で使う文言（理由の印ではない。U5）。 */
export const NO_ASSIGNMENT_MESSAGE = 'この月の割り当てはまだありません';
export const NO_DUTY_LABEL = '担当なし';
export const MONTH_CONFIRMED_LABEL = '確定済み';
export const OVERWRITE_CONFIRM_HEADING = '次の担当が上書きされます';
export const COPY_LAST_MONTH_LABEL = '先月と同じにする';
export const CALENDAR_LOAD_FAILED_RETRY = '読み込み直す';

/** 「先月と同じにする」の結果の文言 2 つ（BR6.17） */
export const COPY_LAST_MONTH_SKIPPED_INACTIVE = '使わないお手伝いは入れませんでした';
export const COPY_LAST_MONTH_NONE = '先月の割り当てはありません';

/** 保存が 500 になったときの文言と、一部が書き換わっていることがある旨（NFR2.28） */
export const ASSIGNMENT_SAVE_FAILED = '保存できませんでした。もう一度保存してください';
export const ASSIGNMENT_SAVE_FAILED_PARTIAL_NOTE =
  '一部の担当だけが書き換わっていることがあります。もう一度保存すると、そろいます';

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** 日付（`YYYY-MM-DD`）を「1月4日」の形にする。 */
function monthAndDay(date: string): string {
  const [, month, day] = date.split('-').map(Number) as [number, number, number];
  return `${month}月${day}日`;
}

/** 重なりの一行: 「1月4日(月) の皿洗いに担当が 2 人います」（AC3.1.6） */
export function assignmentOverlapMessage(date: string, choreName: string): string {
  return `${monthAndDay(date)}(${WEEKDAY_LABELS[weekdayOf(date)]}) の${choreName}に担当が 2 人います`;
}

/** 上書きの一覧の一行: 「1月22日 皿洗い: 太郎 → 花子」（AC3.1.5） */
export function overwriteChangeMessage(
  date: string,
  choreName: string,
  fromName: string,
  toName: string,
): string {
  return `${monthAndDay(date)} ${choreName}: ${fromName} → ${toName}`;
}

/** お手伝いの種類の画面で使う文言（理由の印ではない。U4）。 */
export const CHORE_TYPE_NAME_TAKEN_INACTIVE =
  '『使わない』になっている同じ名前の種類があります。『使う』に戻すか、別の名前で登録してください';

/** 名前が重なったときの文言。相手が「使う」なら別の名前を勧め、「使わない」なら「使う」に戻す案内にする（BR5.3）。 */
export function choreTypeNameTakenMessage(conflictActive: boolean): string {
  return conflictActive ? MESSAGES.CHORE_TYPE_NAME_TAKEN : CHORE_TYPE_NAME_TAKEN_INACTIVE;
}

/** 名前の欄の下の案内（BR5.4） */
export const CHORE_TYPE_NAME_HINT =
  '1 日に 2 回以上あるお手伝いは『皿洗い（追加分）』のように分けて登録します';

/** 単価を変える画面の注意（BR5.7） */
export const CHORE_TYPE_PRICE_CHANGE_NOTE =
  '単価を変えると、このあとに付く記録から新しい単価になります';

/** 「使わない」を押したときの確かめ（BR5.8） */
export const CHORE_TYPE_DEACTIVATE_CONFIRM =
  '使わないにすると、新しい割り当てで選べなくなります。過去の記録とお小遣いはそのまま残ります';

/** 「消す」を押したときの確かめ（BR5.9） */
export const CHORE_TYPE_DELETE_CONFIRM = 'この種類を消しますか？ 消すと元に戻せません';

/** 消そうとして 409 CHORE_TYPE_IN_USE になったとき、種類を「使わない」にしたことを伝える文言（AC2.1.6） */
export const CHORE_TYPE_IN_USE_DEACTIVATED =
  '割り当てに使われたことがあるので消せません。『使わない』にしました';

/** 消そうとして 404 になったときの文言 */
export const CHORE_TYPE_ALREADY_GONE = 'すでに消えています';
/** 変更を保存しようとして 404 になったとき（ほかの人が先に消した）の文言 */
export const CHORE_TYPE_NO_LONGER_EXISTS = 'この種類はもうありません';

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

/** 記録（U6）で使う文言。理由の印ではない。LINE と画面の両方が引く（C10）。 */
export const RECORD_LIST_HEADING = 'どのお手伝いを記録しますか';
export const RECORD_CONFIRM_BUTTON = '記録する';
export const RECORD_CANCEL_BUTTON = 'やめる';
/** 選択肢が 12 件を超えたときに添える案内（BR7.2） */
export const RECORD_OVERFLOW_NOTE = 'ほかの担当はアプリから記録してください';
/** 取引が 2 回続けて断られたとき（INTERNAL）の記録用の文言（functional-spec の表） */
export const RECORD_FAILED_MESSAGE = 'うまく記録できませんでした。もう一度お試しください';

/** 日付（`YYYY-MM-DD`）を「1/5」の形（月/日）にする。 */
function monthSlashDay(date: string): string {
  const [, month, day] = date.split('-').map(Number) as [number, number, number];
  return `${month}/${day}`;
}

/** 記録したときの返事: 「皿洗いを記録しました（16:42）」（BR7.9）。time は日本時間の HH:mm。 */
export function recordedMessage(choreName: string, time: string): string {
  return `${choreName}を記録しました（${time}）`;
}

/** 画面の確認の問いかけ: 「1/5 皿洗いを記録しますか」（BR7.10）。 */
export function recordConfirmQuestion(date: string, choreName: string): string {
  return `${monthSlashDay(date)} ${choreName}を記録しますか`;
}

/** 選べない担当の 1 行: 「皿洗い（済 16:42）」「掃除機（×）」（BR7.2、AC5.1.3）。 */
export function doneDutyLabel(choreName: string, time: string): string {
  return `${choreName}（済 ${time}）`;
}
export function skippedDutyLabel(choreName: string): string {
  return `${choreName}（×）`;
}

/** 理由の印から文言を引く。未知の印には INTERNAL の文言を返す。 */
export function getMessage(reason: string): string {
  return isReason(reason) ? MESSAGES[reason] : MESSAGES.INTERNAL;
}

/** 確認・修正と確定（U7）で使う文言。理由の印ではない。画面が引く（C10）。 */
import type { DutyStatus, MonthConfirmPreview, StatusChangePreview } from './api-types';

export const STATUS_CONFIRM_BUTTON = 'はい';
export const STATUS_CANCEL_BUTTON = 'やめる';
/** cancel・済→× のときに添える注意（BR8.3） */
export const STATUS_DROP_FROM_COUNT_NOTE = 'お小遣いの回数から外れます';
export const MONTH_RECONFIRM_RETRY = '読み込み直す';

/** 状態の表示名（確認の 1 行で使う）。 */
const STATUS_LABEL: Record<DutyStatus, string> = {
  todo: '未',
  done: '済',
  skipped: '×',
};

/** markDone で添える注意「{単価} 円で数えます」（BR8.3）。単価は確認時点の getCurrentUnitPrice の値。 */
export function unitPriceCountNote(unitPrice: number): string {
  return `${unitPrice} 円で数えます`;
}

/**
 * 状態の変更の確認の 1 行（BR8.3）。
 * markDone（済にする）は「{月}/{日} {お手伝い} {子供} を『済』にします」、
 * それ以外は「{月}/{日} {お手伝い} {子供}: {前} → {後} に戻します／にします」。
 */
export function statusChangePreviewLine(preview: StatusChangePreview): string {
  const head = `${monthSlashDay(preview.date)} ${preview.choreName} ${preview.childName}`;
  if (preview.toStatus === 'done') return `${head} を『済』にします`;
  // 未・× に戻すとき（済→未、×→未）は「戻します」、それ以外（未→×、済→×）は「にします」
  const tail = preview.toStatus === 'todo' ? 'に戻します' : 'にします';
  return `${head}: ${STATUS_LABEL[preview.fromStatus]} → ${STATUS_LABEL[preview.toStatus]} ${tail}`;
}

/** 月を確定する確認の本文（BR8.10）。未の件数（todoCount ≥ 1）があれば注意を添える。 */
export function monthConfirmPreviewText(preview: MonthConfirmPreview): string {
  if (preview.action === 'unconfirm') {
    return `${preview.month}の確定を取り消しますか？ 取り消すと、また変更できるようになります`;
  }
  const base = `${preview.month}を確定しますか？ 確定すると変更できなくなります`;
  if (preview.todoCount !== undefined && preview.todoCount >= 1) {
    return `${base}。未の担当が ${preview.todoCount} 件あります。確定すると、これらは記録もやらなかったにもできなくなります`;
  }
  return base;
}

/** 担当の代わりの申し出（U8）で使う LINE の文言。理由の印ではない（C10、BR9.14）。 */
export const SWAP_LIST_HEADING = '代わってほしい担当を選んでください';
/** 候補が 10 件を超えたときに添える案内（BR9.6） */
export const SWAP_OVERFLOW_NOTE =
  '近い日の担当だけ出しています。ほかの担当は、その日が近づいたらまた『家事交代』と送ってください';
/** 管理者への返事（BR9.3）。始める言葉は入れない */
export const SWAP_ADMIN_GUIDE = '代わってもらう申し出は子供だけができます';
/** 1 対 1 への返事（BR9.4） */
export const SWAP_ONE_TO_ONE_GUIDE =
  '代わってほしいときは、家族のグループで『家事交代』と送ってください';
export const SWAP_OFFER_FAILED_MESSAGE = 'うまく申し出られませんでした。もう一度お試しください';
export const SWAP_ACCEPT_FAILED_MESSAGE = 'うまく引き受けられませんでした。もう一度お試しください';
export const SWAP_ACCEPT_BUTTON = '引き受ける';
export const SWAP_WITHDRAW_BUTTON = '申し出をやめる';

/** 名前が引けなかったときの言い換え（BR9.14） */
const SWAP_UNKNOWN_CHILD = 'だれか';
const SWAP_UNKNOWN_CHORE = 'お手伝い';

function swapParts(
  childName: string | undefined,
  date: string,
  choreName: string | undefined,
): { who: string; when: string; what: string } {
  return {
    who: childName ? childName : SWAP_UNKNOWN_CHILD,
    when: monthAndDay(date),
    what: choreName ? choreName : SWAP_UNKNOWN_CHORE,
  };
}

/** 申し出の知らせ: 「花子が 1月8日 の皿洗いを代わってくれる人を探しています」（BR9.14） */
export function swapOfferedMessage(
  childName: string | undefined,
  date: string,
  choreName: string | undefined,
): string {
  const { who, when, what } = swapParts(childName, date, choreName);
  return `${who}が ${when} の${what}を代わってくれる人を探しています`;
}

/** 引き受けの知らせ: 「太郎が 1月8日 の皿洗いを引き受けました」 */
export function swapAcceptedMessage(
  childName: string | undefined,
  date: string,
  choreName: string | undefined,
): string {
  const { who, when, what } = swapParts(childName, date, choreName);
  return `${who}が ${when} の${what}を引き受けました`;
}

/** 取り下げの知らせ: 「花子が 1月8日 の皿洗いの申し出をやめました」 */
export function swapWithdrawnMessage(
  childName: string | undefined,
  date: string,
  choreName: string | undefined,
): string {
  const { who, when, what } = swapParts(childName, date, choreName);
  return `${who}が ${when} の${what}の申し出をやめました`;
}

/** お小遣いの画面 S5 の文言（U9。理由の印ではない。C10、BR10.9〜BR10.11） */
export const ALLOWANCE_UNCONFIRMED_LABEL = '確定していません';
export const ALLOWANCE_EMPTY_THIS_MONTH = '今月の記録はまだありません（0 円）';
export const ALLOWANCE_EMPTY_OTHER_MONTH = 'この月の記録はまだありません（0 円）';
export const ALLOWANCE_NO_CHILDREN = 'お小遣いを表示する子供がまだいません';
export const ALLOWANCE_YOU_SUFFIX = '（あなた）';
export const ALLOWANCE_UNKNOWN_CHILD = '名前が分からない子供';
export const ALLOWANCE_UNKNOWN_CHORE = '不明なお手伝い';
export const ALLOWANCE_LOAD_FAILED_MESSAGE = '表示できませんでした。もう一度お試しください';

/** 見出し: 「2027年1月のお小遣い」（月は 0 埋めしない。`month` は `YYYY-MM`） */
export function allowanceHeading(month: string): string {
  const [year = '', mm = ''] = month.split('-');
  return `${Number(year)}年${Number(mm)}月のお小遣い`;
}
