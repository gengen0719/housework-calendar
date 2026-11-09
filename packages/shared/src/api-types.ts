import type { Reason } from './reasons';

/** 契約 C1・C2 の要求と結果の型（U1 が受け持つ分）。 */

export type Role = 'admin' | 'child';

export type FriendStatus = 'friend' | 'blocked';

export interface MeFamily {
  familyId: string;
  name: string;
  role: Role;
  notificationGroupRegistered?: boolean;
}

/** GET /v1/me */
export interface Me {
  userId: string;
  displayName: string;
  family: MeFamily | null;
}

/** POST /v1/sessions */
export interface CreateSessionRequest {
  idToken: string;
}

export interface CreateSessionResponse {
  sessionToken: string;
  /** UTC の ISO 8601 */
  expiresAt: string;
}

/** POST /v1/families（本文。ヘッダー Idempotency-Key は必須） */
export interface CreateFamilyRequest {
  name: string;
}

export interface Family {
  familyId: string;
  name: string;
  adminUserId: string;
}

/** 201 の本文。GET /v1/me の family と同じ形（役割は作った人なので常に admin） */
export type CreateFamilyResponse = MeFamily;

/** GET /v1/family/members の 1 件（LINE のユーザー ID は含めない。U2） */
export interface Member {
  userId: string;
  displayName: string;
  role: Role;
}

/** POST /v1/family/invitations、GET /v1/family/invitation（U2）。expiresAt は UTC の ISO 8601 */
export interface InvitationView {
  url: string;
  expiresAt: string;
}

/** GET /v1/invitations/:token（U2） */
export interface InvitationPreview {
  familyName: string;
  expiresAt: string;
}

/** GET /v1/family/notification-group（U3）。グループ ID は含めない。registeredAt は UTC の ISO 8601。お知らせ先がないときの本文は null */
export interface NotificationGroupView {
  groupName: string | null;
  registeredAt: string;
}

/** お手伝いの種類（U4。entities.md の ChoreType）。家族の ID は返さない。日時は UTC の ISO 8601。説明がなければ description はない */
export interface ChoreType {
  choreTypeId: string;
  name: string;
  unitPrice: number;
  description?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** POST・PUT /v1/chore-types の本文（U4）。active は含めない */
export interface ChoreTypeInput {
  name: string;
  unitPrice: number;
  description?: string;
}

/** PATCH /v1/chore-types/:choreTypeId の本文（U4） */
export interface SetChoreTypeActiveRequest {
  active: boolean;
}

/** 担当の状態（未・済・×） */
export type DutyStatus = 'todo' | 'done' | 'skipped';

/** 担当の出どころ（割り当てから作った・管理者が変えた・引き受けた。U5） */
export type DutyOrigin = 'rule' | 'manual' | 'swap';

/**
 * 日ごとの担当（U5。契約 C1 の Duty）。date は日本時間の日付、recordedAt は UTC の ISO 8601。
 * 記録がなければ recordedAt・recordedBy・recordedByName・unitPrice は null。
 * version は担当が変わるたびに増える（U6〜U8 が条件に使う）。
 */
export interface Duty {
  dutyId: string;
  date: string;
  choreTypeId: string;
  choreName: string;
  childUserId: string;
  status: DutyStatus;
  origin: DutyOrigin;
  version: number;
  recordedAt: string | null;
  recordedBy: string | null;
  recordedByName: string | null;
  unitPrice: number | null;
}

/** MonthCalendar.children の 1 件（その家族の子供） */
export interface CalendarChild {
  userId: string;
  displayName: string;
}

/** MonthCalendar.choreTypes の 1 件（担当に出てくる種類。「使わない」も含む） */
export interface CalendarChoreType {
  choreTypeId: string;
  name: string;
  active: boolean;
}

/**
 * GET /v1/months/:month/calendar、PUT の 200（U5）。today は裏側の日本時間の今日。
 * hasAssignment は割り当ての記録が保存されているか（行が 0 行でも true）。
 */
export interface MonthCalendar {
  month: string;
  confirmed: boolean;
  hasAssignment: boolean;
  today: string;
  duties: Duty[];
  children: CalendarChild[];
  choreTypes: CalendarChoreType[];
}

/** 割り当ての 1 行（種類ごとの子供と曜日。曜日は 0=日曜〜6=土曜） */
export interface AssignmentRule {
  choreTypeId: string;
  childUserId: string;
  weekdays: number[];
}

/** GET /v1/months/:month/assignment（U5） */
export interface AssignmentView {
  month: string;
  rules: AssignmentRule[];
  exists: boolean;
}

/** PUT /v1/months/:month/assignment の本文（U5）。confirmedChangesHash は上書きの確かめの印（64 文字の 16 進数） */
export interface SaveAssignmentRequest {
  rules: AssignmentRule[];
  confirmedChangesHash?: string;
}

/** PATCH /v1/duties/:dutyId の本文（U5） */
export interface ChangeDutyChildRequest {
  childUserId: string;
}

/** POST /v1/duties/:dutyId/record の本文（U6）。見せた時点の担当の version だけを送る */
export interface RecordDutyRequest {
  version: number;
}

/** POST /v1/duties/:dutyId/record の 200 の本文（U6）。記録後の担当（U5 の Duty をそのまま使う） */
export type RecordDutyResponse = Duty;

/**
 * 409 OVERWRITE_CONFIRMATION_REQUIRED の details.changes の 1 件（U5）。
 * 作り直したあとにその日のその種類の担当がなければ toChildUserId は null（画面は「なし」と出す）。
 */
export interface OverwriteChange {
  date: string;
  choreTypeId: string;
  fromChildUserId: string;
  toChildUserId: string | null;
}

/** 422 ASSIGNMENT_OVERLAP の details.overlaps の 1 件（U5）。weekday は 0=日曜〜6=土曜 */
export interface OverlapItem {
  date: string;
  weekday: number;
  choreTypeId: string;
  childUserIds: string[];
}

/** 割り当ての入力の上限（NFR4.46）: 行は 200 まで、種類は 90 まで */
export const ASSIGNMENT_MAX_RULES = 200;
export const ASSIGNMENT_MAX_CHORE_TYPES = 90;

/** 画面用 API の失敗の形 */
export interface ApiError {
  error: {
    reason: Reason;
    details?: Record<string, unknown>;
  };
}

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/** 家族の名前の長さ（前後の空白を除いて 1〜20 文字。BR1.9） */
export const FAMILY_NAME_MIN_LENGTH = 1;
export const FAMILY_NAME_MAX_LENGTH = 20;

/** 種類の名前（1〜20 文字）と説明（100 文字まで）の長さ。コードポイントで数える（BR5.2、BR5.6） */
export const CHORE_TYPE_NAME_MIN_LENGTH = 1;
export const CHORE_TYPE_NAME_MAX_LENGTH = 20;
export const CHORE_TYPE_DESCRIPTION_MAX_LENGTH = 100;
