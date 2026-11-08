import type { FriendStatus, Role } from '@housework/shared';

/** 家族（entities.md の Family）。管理者は 1 人だけ。 */
export interface Family {
  familyId: string;
  name: string;
  adminUserId: string;
  createdAt: string;
}

/** 操作の送り直しを見分ける記録（entities.md の RequestRecord）。expiresAt は TTL 用の UNIX 秒。 */
export interface RequestRecord {
  userId: string;
  idempotencyKey: string;
  operation: 'createFamily';
  /** 前に返した結果の本文 */
  result: { familyId: string; name: string; role: Role; notificationGroupRegistered: boolean };
  expiresAt: number;
}

/** 利用者（entities.md の User）。日時は UTC の ISO 8601。 */
export interface User {
  userId: string;
  lineUserId: string;
  displayName: string;
  friendStatus: FriendStatus;
  familyId?: string;
  role?: Role;
  registeredAt: string;
  friendStatusChangedAt: string;
}
