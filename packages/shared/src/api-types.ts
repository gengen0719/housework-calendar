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
