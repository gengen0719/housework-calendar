import type { FriendStatus, InvitationView, MeFamily, Role } from '@housework/shared';

/** 家族（entities.md の Family）。管理者は 1 人だけ。 */
export interface Family {
  familyId: string;
  name: string;
  adminUserId: string;
  createdAt: string;
  /** いま使える招待の印と ID（U2。招待を作ったことがなければ空） */
  currentInvitationToken?: string;
  currentInvitationId?: string;
  /** いまのお知らせ先のグループ（U3。なければ空） */
  notificationGroupId?: string;
}

/** お知らせ先のグループ（entities.md の NotificationGroup）。日時は UTC の ISO 8601。groupName は受け取れなければ空。 */
export interface NotificationGroup {
  groupId: string;
  familyId: string;
  groupName?: string;
  registeredByUserId: string;
  registeredAt: string;
}

/** 招待（entities.md の Invitation）。日時は UTC の ISO 8601。ttl は TTL 用の UNIX 秒（期限 + 7 日）。 */
export interface Invitation {
  token: string;
  invitationId: string;
  familyId: string;
  createdByUserId: string;
  createdAt: string;
  expiresAt: string;
  status: 'active' | 'replaced';
  ttl: number;
}

/** 送り直しを見分ける操作の名前（BR3.5） */
export type RequestOperation = 'createFamily' | 'createInvitation' | 'acceptInvitation';

/**
 * 操作の送り直しを見分ける記録（entities.md の RequestRecord）。expiresAt は TTL 用の UNIX 秒。
 * operation と target（createInvitation は familyId、acceptInvitation は招待の印の SHA-256）が同じときだけ、前の結果を返す。
 */
export interface RequestRecord {
  userId: string;
  idempotencyKey: string;
  operation: RequestOperation;
  target?: string;
  /** 前に返した結果の本文（createFamily と acceptInvitation は MeFamily、createInvitation は InvitationView） */
  result: MeFamily | InvitationView;
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
  /** 家族に入った時刻（U2。ない人は家族の createdAt とみなす） */
  familyJoinedAt?: string;
  registeredAt: string;
  friendStatusChangedAt: string;
}
