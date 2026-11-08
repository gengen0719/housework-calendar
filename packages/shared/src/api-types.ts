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
