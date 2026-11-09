import type {
  ChoreType,
  DutyOrigin,
  DutyStatus,
  FriendStatus,
  InvitationView,
  MeFamily,
  Role,
} from '@housework/shared';

export type { DutyOrigin, DutyStatus };

/**
 * お手伝いの種類の保存された形（entities.md の ChoreType、U4）。日時は UTC の ISO 8601。
 * 説明がなければ description はない。テーブルの項目は sk（`TYPE#<choreTypeId>`）を足した形（choreTypeRepository）。
 */
export interface ChoreTypeRecord {
  familyId: string;
  choreTypeId: string;
  name: string;
  unitPrice: number;
  description?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 割り当ての 1 行（種類ごとの子供と曜日。曜日は 0=日曜〜6=土曜） */
export interface AssignmentRuleRecord {
  choreTypeId: string;
  childUserId: string;
  weekdays: number[];
}

/**
 * 月の割り当て（U5）。Calendar の項目は sk（`M#<month>#A`）を足した形。
 * choreTypeIds（文字列の集合）は使用の確かめ用で、行が 0 行のときは置かない。
 */
export interface AssignmentRecord {
  familyId: string;
  month: string;
  rules: AssignmentRuleRecord[];
  choreTypeIds?: Set<string>;
  updatedAt: string;
  updatedByUserId: string;
}

/**
 * 日ごとの担当（U5）。Calendar の項目は sk（`M#<month>#D#<date>#<choreTypeId>`）を足した形。
 * recordedAt・recordedBy・unitPrice は U6〜U8 が書く（U5 は読むだけ）。
 */
export interface DutyRecord {
  dutyId: string;
  familyId: string;
  month: string;
  date: string;
  choreTypeId: string;
  childUserId: string;
  status: DutyStatus;
  origin: DutyOrigin;
  version: number;
  createdAt: string;
  updatedAt: string;
  recordedAt?: string;
  recordedBy?: string;
  unitPrice?: number;
}

/** 月の状態（確定したか。U7 が書く）。Calendar の項目は sk（`M#<month>#S`）を足した形。 */
export interface MonthStateRecord {
  familyId: string;
  month: string;
  confirmed: boolean;
  confirmedAt?: string;
}

/** 担当の ID から担当の場所を引く印。Calendar の項目は sk（`DID#<dutyId>`）を足した形。 */
export interface DutyRefRecord {
  familyId: string;
  dutyId: string;
  month: string;
  date: string;
  choreTypeId: string;
}

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
export type RequestOperation =
  'createFamily' | 'createInvitation' | 'acceptInvitation' | 'createChoreType';

/**
 * 操作の送り直しを見分ける記録（entities.md の RequestRecord）。expiresAt は TTL 用の UNIX 秒。
 * operation と target（createInvitation は familyId、acceptInvitation は招待の印の SHA-256）が同じときだけ、前の結果を返す。
 */
export interface RequestRecord {
  userId: string;
  idempotencyKey: string;
  operation: RequestOperation;
  target?: string;
  /** 前に返した結果の本文（createFamily と acceptInvitation は MeFamily、createInvitation は InvitationView、createChoreType は ChoreType） */
  result: MeFamily | InvitationView | ChoreType;
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
