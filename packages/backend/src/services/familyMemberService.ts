import { randomUUID } from 'node:crypto';
import {
  err,
  FAMILY_NAME_MAX_LENGTH,
  FAMILY_NAME_MIN_LENGTH,
  ok,
  type FriendStatus,
  type InvitationPreview,
  type InvitationView,
  type Me,
  type MeFamily,
  type Member,
  type NotificationGroupView,
  type Result,
  type Role,
} from '@housework/shared';
import { logger } from '../lib/logger';
import type { Family, Invitation, RequestRecord, User } from '../models';
import type { FamilyContext } from '../middleware/requireMembership';
import * as familyRepository from '../repositories/familyRepository';
import * as invitationRepository from '../repositories/invitationRepository';
import * as notificationGroupRepository from '../repositories/notificationGroupRepository';
import * as requestRecordRepository from '../repositories/requestRecordRepository';
import * as userRepository from '../repositories/userRepository';
import * as lineApiService from './lineApiService';
import {
  buildInvitationUrl,
  hashToken,
  isWellFormedToken,
  INVITATION_LIFETIME_MS,
  INVITATION_RETENTION_SECONDS,
  newInvitationToken,
  tokenPrefix,
} from './invitationTokenService';

export interface UserStatus {
  friendStatus: FriendStatus;
  familyId?: string;
  role?: Role;
}

/**
 * 友だち登録を記録する（C6 registerUser）。何度呼んでも 1 人（BR1.1）。
 * すでにいる人は新しく作らず friend に戻す。表示名は最初のまま変えない（BR1.4）。
 */
export async function registerUser(
  lineUserId: string,
  displayName: string,
  now: Date = new Date(),
): Promise<User> {
  const existing = await userRepository.findByLineUserId(lineUserId);
  const at = now.toISOString();
  if (existing) {
    if (existing.friendStatus === 'friend') return existing;
    await userRepository.setFriendStatus(existing.userId, 'friend', at);
    return { ...existing, friendStatus: 'friend', friendStatusChangedAt: at };
  }
  const user: User = {
    userId: randomUUID(),
    lineUserId,
    displayName,
    friendStatus: 'friend',
    registeredAt: at,
    friendStatusChangedAt: at,
  };
  await userRepository.create(user);
  return user;
}

/** ブロックされたとき（C6 markBlocked）。記録は消さず、家族と役割も残す。記録がなければ何もしない（BR1.3）。 */
export async function markBlocked(lineUserId: string, now: Date = new Date()): Promise<void> {
  const existing = await userRepository.findByLineUserId(lineUserId);
  if (!existing || existing.friendStatus === 'blocked') return;
  await userRepository.setFriendStatus(existing.userId, 'blocked', now.toISOString());
}

export async function findUserByLineId(lineUserId: string): Promise<Result<User, 'NOT_FOUND'>> {
  const user = await userRepository.findByLineUserId(lineUserId);
  return user ? ok(user) : err('NOT_FOUND');
}

/**
 * その家族の子供を 1 人、強い整合性で確かめる（C6 findFamilyChild。U5 の割り当てと担当の変更が使う）。
 * 利用者がいない、ほかの家族の人、管理者は、どれも同じ NOT_FOUND。結果整合の索引は使わない。
 */
export async function findFamilyChild(
  ctx: FamilyContext,
  userId: string,
): Promise<Result<{ userId: string; displayName: string }, 'NOT_FOUND'>> {
  const user = await userRepository.findById(userId, { consistent: true });
  if (!user || user.familyId !== ctx.familyId || user.role !== 'child') return err('NOT_FOUND');
  return ok({ userId: user.userId, displayName: user.displayName });
}

export async function getUserStatus(userId: string): Promise<Result<UserStatus, 'NOT_FOUND'>> {
  const user = await userRepository.findById(userId, { consistent: true });
  if (!user) return err('NOT_FOUND');
  return ok({
    friendStatus: user.friendStatus,
    ...(user.familyId ? { familyId: user.familyId } : {}),
    ...(user.role ? { role: user.role } : {}),
  });
}

/**
 * セッションを出してよい利用者を決める（BR1.5、BR1.11）。
 * 友だちとして記録されている人はそのまま。記録がない人とブロック中の人だけ、LINE に友だちか問い合わせる。
 * 友だちなら記録して（ブロック中なら友だちに戻して）返す。友だちでなければ NOT_FRIEND。
 * LINE が時間切れ・5xx のときは投げずに LINE_API_UNAVAILABLE を返す（NFR2.4）。
 */
export async function resolveSessionUser(
  lineUserId: string,
  now: Date = new Date(),
): Promise<Result<User, 'NOT_FRIEND' | 'LINE_API_UNAVAILABLE'>> {
  const existing = await userRepository.findByLineUserId(lineUserId);
  if (existing?.friendStatus === 'friend') return ok(existing);
  let profile: Awaited<ReturnType<typeof lineApiService.getProfile>>;
  try {
    profile = await lineApiService.getProfile(lineUserId);
  } catch (cause) {
    if (cause instanceof lineApiService.LineApiError) return err('LINE_API_UNAVAILABLE');
    throw cause;
  }
  if (!profile.ok) return err('NOT_FRIEND');
  return ok(await registerUser(lineUserId, profile.value.displayName, now));
}

export type CreateFamilyFailure =
  'NOT_FOUND' | 'INVALID_FAMILY_NAME' | 'ALREADY_IN_FAMILY' | 'IDEMPOTENCY_KEY_REUSED';

function toResult(record: RequestRecord['result']): MeFamily {
  return { ...(record as MeFamily) };
}

/** 同じ印の記録の結果を返す。操作か対象が違えば IDEMPOTENCY_KEY_REUSED（BR3.5）。 */
function replay<T extends RequestRecord['result']>(
  record: RequestRecord,
  operation: RequestRecord['operation'],
  target?: string,
): Result<T, 'IDEMPOTENCY_KEY_REUSED'> {
  return requestRecordRepository.isSameRequest(record, operation, target)
    ? ok(record.result as T)
    : err('IDEMPOTENCY_KEY_REUSED');
}

/**
 * 家族を作る（C6 createFamily、F5）。作った人が管理者になる（BR1.7）。
 * 順番: 同じ印の成功済みの記録があれば前と同じ結果（BR2.8）→ 名前の確かめ（BR1.9）→ すでに家族なら断る（BR1.8）
 * → 家族・利用者・結果の記録を 1 つの取引で書く。取引の条件が外れたとき（同時の二重の作成）は、
 * 記録を読み直し、同じ印の成功なら前と同じ結果、そうでなければ ALREADY_IN_FAMILY。
 */
export async function createFamily(
  userId: string,
  name: string,
  idempotencyKey: string,
  now: Date = new Date(),
): Promise<Result<MeFamily, CreateFamilyFailure>> {
  const previous = await requestRecordRepository.find(userId, idempotencyKey, now);
  if (previous) {
    const replayed = replay<MeFamily>(previous, 'createFamily');
    return replayed.ok ? ok(toResult(replayed.value)) : replayed;
  }

  const trimmed = name.trim();
  const length = [...trimmed].length;
  if (length < FAMILY_NAME_MIN_LENGTH || length > FAMILY_NAME_MAX_LENGTH) {
    return err('INVALID_FAMILY_NAME');
  }

  const user = await userRepository.findById(userId);
  if (!user) return err('NOT_FOUND');
  if (user.familyId) return err('ALREADY_IN_FAMILY');

  const familyId = randomUUID();
  const result: MeFamily = {
    familyId,
    name: trimmed,
    role: 'admin',
    notificationGroupRegistered: false,
  };
  const outcome = await familyRepository.createWithAdmin(
    { familyId, name: trimmed, adminUserId: userId, createdAt: now.toISOString() },
    { userId, idempotencyKey, operation: 'createFamily', result },
    now,
  );
  if (outcome === 'created') return ok(toResult(result));

  const winner = await requestRecordRepository.find(userId, idempotencyKey, now);
  if (!winner) return err('ALREADY_IN_FAMILY');
  const replayed = replay<MeFamily>(winner, 'createFamily');
  return replayed.ok ? ok(toResult(replayed.value)) : replayed;
}

/** メンバーの一覧の並べ替えに使う、家族に入った時刻。ない人（U2 より前に家族を作った人）は家族の作成時刻とみなす。 */
function joinedAtOf(row: userRepository.FamilyMemberRow, family: Family): string {
  return row.familyJoinedAt ?? family.createdAt;
}

/** 文字の並びを（UTF-16 の順で）比べる。ロケールに左右されず、いつも同じ順になる。 */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 家族のメンバーの一覧（C6 listMembers、BR3.11）。管理者が最初、続けて子供を家族に入った順
 * （同じ時刻は表示名、それも同じなら userId の順）。LINE のユーザー ID は返さない。
 * 索引は結果整合なので、結果に本人が含まれなければ、Users を強い整合性で読んで足してから並べる。
 */
export async function listMembers(ctx: FamilyContext): Promise<Member[]> {
  const family = await familyRepository.findById(ctx.familyId);
  if (!family) {
    throw new Error(`利用者の家族の記録が見つかりません: ${ctx.familyId}`);
  }
  const rows = await userRepository.listByFamily(ctx.familyId);
  if (!rows.some((row) => row.userId === ctx.userId)) {
    const self = await userRepository.findById(ctx.userId, { consistent: true });
    if (self?.familyId === ctx.familyId && self.role) {
      rows.push({
        userId: self.userId,
        displayName: self.displayName,
        role: self.role,
        ...(self.familyJoinedAt ? { familyJoinedAt: self.familyJoinedAt } : {}),
      });
    }
  }
  return rows
    .filter((row): row is typeof row & { role: Role } => row.role !== undefined)
    .sort(
      (a, b) =>
        Number(b.role === 'admin') - Number(a.role === 'admin') ||
        compareText(joinedAtOf(a, family), joinedAtOf(b, family)) ||
        compareText(a.displayName, b.displayName) ||
        compareText(a.userId, b.userId),
    )
    .map(({ userId, displayName, role }) => ({ userId, displayName, role }));
}

export type CreateInvitationFailure = 'IDEMPOTENCY_KEY_REUSED' | 'INTERNAL';

/** 作り直しの取引が競合で断られたとき、読み直してやり直す回数（最初の 1 回のあとに 1 回だけ。BR3.4） */
const MAX_ROTATE_ATTEMPTS = 2;

/**
 * 招待を作る・作り直す（C6 createInvitation、F2、BR3.1〜BR3.5）。管理者かどうかは呼び出し側（requireAdmin）が確かめる。
 * 同じ印の成功済みの記録があれば前と同じ結果（操作か対象が違えば IDEMPOTENCY_KEY_REUSED）。なければ、
 * 家族と前の招待を強い整合性で読み、取引で「家族の印の更新・新しい招待・前の招待の replaced・送り直しの記録」を一緒に書く。
 * 競合で断られたら 1 回だけ読み直してやり直し、それでも断られたら INTERNAL。
 */
export async function createInvitation(
  ctx: FamilyContext,
  idempotencyKey: string,
  liffUrl: string,
  now: Date = new Date(),
): Promise<Result<InvitationView, CreateInvitationFailure>> {
  const previous = await requestRecordRepository.find(ctx.userId, idempotencyKey, now);
  if (previous) return replay<InvitationView>(previous, 'createInvitation', ctx.familyId);

  for (let attempt = 0; attempt < MAX_ROTATE_ATTEMPTS; attempt++) {
    const family = await familyRepository.findById(ctx.familyId, { consistent: true });
    if (!family) throw new Error(`利用者の家族の記録が見つかりません: ${ctx.familyId}`);
    const previousToken = family.currentInvitationToken;
    const previousInvitation = previousToken
      ? await invitationRepository.findByToken(previousToken)
      : undefined;

    const token = newInvitationToken();
    const expiresAt = new Date(now.getTime() + INVITATION_LIFETIME_MS);
    const invitation: Invitation = {
      token,
      invitationId: randomUUID(),
      familyId: ctx.familyId,
      createdByUserId: ctx.userId,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: 'active',
      ttl: Math.floor(expiresAt.getTime() / 1000) + INVITATION_RETENTION_SECONDS,
    };
    const view: InvitationView = {
      url: buildInvitationUrl(liffUrl, token),
      expiresAt: invitation.expiresAt,
    };

    const outcome = await familyRepository.rotateInvitation(
      {
        familyId: ctx.familyId,
        ...(previousToken ? { previousToken } : {}),
        previousInvitationExists: previousInvitation !== undefined,
        invitation,
        record: { userId: ctx.userId, idempotencyKey, result: view },
      },
      now,
    );
    if (outcome === 'created') {
      logger.info({
        event: 'INVITATION_CREATED',
        familyId: ctx.familyId,
        userId: ctx.userId,
        tokenPrefix: tokenPrefix(token),
        replacedPrevious: previousInvitation !== undefined,
      });
      return ok(view);
    }
    if (outcome === 'record-conflict') {
      const winner = await requestRecordRepository.find(ctx.userId, idempotencyKey, now);
      if (!winner) return err('INTERNAL');
      return replay<InvitationView>(winner, 'createInvitation', ctx.familyId);
    }
  }
  return err('INTERNAL');
}

/**
 * いま使える招待（C6 getCurrentInvitation、BR3.12）。管理者かどうかは呼び出し側が確かめる。
 * 家族に印がない、招待の項目がない（TTL で消えた）、replaced、期限切れのときは null。
 */
export async function getCurrentInvitation(
  ctx: FamilyContext,
  liffUrl: string,
  now: Date = new Date(),
): Promise<InvitationView | null> {
  const family = await familyRepository.findById(ctx.familyId, { consistent: true });
  if (!family?.currentInvitationToken) return null;
  const invitation = await invitationRepository.findByToken(family.currentInvitationToken);
  if (!invitation || !invitationRepository.isUsable(invitation, now)) return null;
  return {
    url: buildInvitationUrl(liffUrl, invitation.token),
    expiresAt: invitation.expiresAt,
  };
}

export type InvitationRejection =
  'INVITATION_INVALID' | 'ALREADY_IN_OTHER_FAMILY' | 'ALREADY_IN_FAMILY';
export type PreviewInvitationFailure = InvitationRejection | 'NOT_FOUND' | 'NOT_FRIEND';
export type AcceptInvitationFailure = PreviewInvitationFailure | 'IDEMPOTENCY_KEY_REUSED';

export interface UsableInvitation {
  invitation: Invitation;
  family: Family;
}

/**
 * 招待が使えるかの判断（security-design.md、BR3.6）。次の順に確かめ、どれに合わなくても同じ INVITATION_INVALID を返す:
 * 印の形 → 招待の項目がある（強い整合性）→ active → 家族のいまの印がこの印（作り直された印を断る）→ 期限より前。
 */
export async function resolveUsableInvitation(
  token: string,
  now: Date = new Date(),
): Promise<Result<UsableInvitation, 'INVITATION_INVALID'>> {
  if (!isWellFormedToken(token)) return err('INVITATION_INVALID');
  const invitation = await invitationRepository.findByToken(token);
  if (!invitation || invitation.status !== 'active') return err('INVITATION_INVALID');
  const family = await familyRepository.findById(invitation.familyId, { consistent: true });
  if (!family || family.currentInvitationToken !== token) return err('INVITATION_INVALID');
  if (!invitationRepository.isUsable(invitation, now)) return err('INVITATION_INVALID');
  return ok({ invitation, family });
}

/** 招待を断ったログ（INVITATION_REJECTED）。印は形が正しいときだけ先頭 4 文字を書く（NFR5.7）。 */
function logRejected(
  userId: string,
  token: string,
  reason: InvitationRejection,
  familyId?: string,
): void {
  logger.info({
    event: 'INVITATION_REJECTED',
    userId,
    reason,
    ...(isWellFormedToken(token) ? { tokenPrefix: tokenPrefix(token) } : {}),
    ...(familyId ? { familyId } : {}),
  });
}

/** 使える招待に対して、開いた人の立場を確かめる（BR3.7）。参加できる人なら null。 */
function judgeMembership(user: User, invitation: Invitation): InvitationRejection | null {
  if (!user.familyId) return null;
  return user.familyId === invitation.familyId ? 'ALREADY_IN_FAMILY' : 'ALREADY_IN_OTHER_FAMILY';
}

/**
 * 招待を開く（C6 previewInvitation、F5）。招待が使えること → 開いた人がどの家族にも入っていないことの順に確かめる。
 * 家族は招待の記録からだけ決める（NFR4.20）。開いただけでは何も書かない。
 */
export async function previewInvitation(
  userId: string,
  token: string,
  now: Date = new Date(),
): Promise<Result<InvitationPreview, PreviewInvitationFailure>> {
  const resolved = await resolveUsableInvitation(token, now);
  if (!resolved.ok) {
    logRejected(userId, token, resolved.reason);
    return resolved;
  }
  const { invitation, family } = resolved.value;
  const user = await userRepository.findById(userId, { consistent: true });
  if (!user) return err('NOT_FOUND');
  if (user.friendStatus !== 'friend') return err('NOT_FRIEND');
  const rejection = judgeMembership(user, invitation);
  if (rejection) {
    logRejected(userId, token, rejection, invitation.familyId);
    return err(rejection);
  }
  return ok({ familyName: family.name, expiresAt: invitation.expiresAt });
}

/**
 * 招待に参加する（C6 acceptInvitation、F6、BR3.8）。順番（reliability-design.md の「参加」）:
 * 1. 同じ印の記録があれば前の結果（操作か対象が違えば IDEMPOTENCY_KEY_REUSED）
 * 2. 招待が使えること、開いた人がどの家族にも入っていないことを確かめる
 * 3. 利用者・招待・家族・結果の記録を 1 つの取引で確かめて書く
 * 4. 断られたら、理由の並びで読み分ける（記録 → 前の結果、利用者 → 読み直して断る、招待・家族 → INVITATION_INVALID）
 */
export async function acceptInvitation(
  userId: string,
  token: string,
  idempotencyKey: string,
  now: Date = new Date(),
): Promise<Result<MeFamily, AcceptInvitationFailure>> {
  const tokenHash = hashToken(token);
  const previous = await requestRecordRepository.find(userId, idempotencyKey, now);
  if (previous) {
    const replayed = replay<MeFamily>(previous, 'acceptInvitation', tokenHash);
    return replayed.ok ? ok(toResult(replayed.value)) : replayed;
  }

  const resolved = await resolveUsableInvitation(token, now);
  if (!resolved.ok) {
    logRejected(userId, token, resolved.reason);
    return resolved;
  }
  const { invitation, family } = resolved.value;
  const user = await userRepository.findById(userId, { consistent: true });
  if (!user) return err('NOT_FOUND');
  if (user.friendStatus !== 'friend') return err('NOT_FRIEND');
  const rejection = judgeMembership(user, invitation);
  if (rejection) {
    logRejected(userId, token, rejection, invitation.familyId);
    return err(rejection);
  }

  const result: MeFamily = {
    familyId: family.familyId,
    name: family.name,
    role: 'child',
    notificationGroupRegistered: false,
  };
  const outcome = await familyRepository.acceptInvitation(
    {
      userId,
      familyId: family.familyId,
      token,
      tokenHash,
      record: { userId, idempotencyKey, result },
    },
    now,
  );
  if (outcome === 'joined') {
    logger.info({
      event: 'INVITATION_ACCEPTED',
      familyId: family.familyId,
      userId,
      tokenPrefix: tokenPrefix(token),
    });
    return ok(toResult(result));
  }

  if (outcome === 'requestRecord') {
    const winner = await requestRecordRepository.find(userId, idempotencyKey, now);
    if (!winner) return err('INVITATION_INVALID');
    const replayed = replay<MeFamily>(winner, 'acceptInvitation', tokenHash);
    return replayed.ok ? ok(toResult(replayed.value)) : replayed;
  }

  if (outcome === 'user') {
    const latest = await userRepository.findById(userId, { consistent: true });
    if (!latest) return err('NOT_FOUND');
    if (latest.friendStatus !== 'friend') return err('NOT_FRIEND');
    const latestRejection = judgeMembership(latest, invitation);
    if (latestRejection) {
      logRejected(userId, token, latestRejection, invitation.familyId);
      return err(latestRejection);
    }
    logger.warn({
      event: 'INVITATION_ACCEPT_USER_CONDITION_UNEXPLAINED',
      userId,
      familyId: invitation.familyId,
    });
    throw new Error('参加の取引が利用者の条件で断られましたが、理由を読み取れません');
  }

  logRejected(userId, token, 'INVITATION_INVALID', invitation.familyId);
  return err('INVITATION_INVALID');
}

export type RegisterNotificationGroupFailure =
  'ADMIN_ONLY' | 'GROUP_USED_BY_OTHER_FAMILY' | 'INTERNAL';

/** 登録の取引が競合で断られたとき、読み直してやり直す回数（最初の 1 回のあとに 1 回だけ。BR4.6） */
const MAX_REGISTER_ATTEMPTS = 2;

/** LINE から受け取ったグループの名前を残す長さ（entities.md の groupName。security-design.md） */
const GROUP_NAME_MAX_LENGTH = 100;

/**
 * お知らせ先のグループを登録する・置き換える（C6 registerNotificationGroup、F7、BR4.5〜BR4.8）。
 * 管理者かどうかはここでも確かめる（呼び出し側は groupCommandGate）。順番（reliability-design.md）:
 * 1. グループの記録を強い整合性で読む。別の家族のもの → GROUP_USED_BY_OTHER_FAMILY（LINE は呼ばない）、同じ家族のもの → 何も書かず成功
 * 2. 家族と、前のグループの記録を強い整合性で読む（前の記録がこの家族のものとして実在するときだけ Delete を入れる）
 * 3. グループの名前を LINE から受け取る（2 秒で打ち切り。失敗しても名前なしで続ける）
 * 4. 取引で「新しいグループの Put・家族の更新・前のグループの Delete」を一緒に書く。断られたら読み直して 1 回だけやり直す
 * 契約の `groupName` 引数は、LINE を呼ぶ前に別の家族かを確かめるため、ここで受け取る（performance-design.md）。
 */
export async function registerNotificationGroup(
  ctx: FamilyContext,
  groupId: string,
  now: Date = new Date(),
): Promise<Result<{ familyName: string }, RegisterNotificationGroupFailure>> {
  if (ctx.role !== 'admin') return err('ADMIN_ONLY');

  let groupName: string | undefined;
  let groupNameFetched = false;
  let attempt = 0;
  let groupTaken = 0;
  while (attempt < MAX_REGISTER_ATTEMPTS) {
    const existing = await notificationGroupRepository.findByGroupId(groupId);
    if (existing && existing.familyId !== ctx.familyId) {
      return err('GROUP_USED_BY_OTHER_FAMILY');
    }
    const family = await familyRepository.findById(ctx.familyId, { consistent: true });
    if (!family) throw new Error(`利用者の家族の記録が見つかりません: ${ctx.familyId}`);
    // 同じ家族の記録があっても、家族の側がこのグループを指しているときだけ「登録済み」とする（食い違いは直す）
    if (existing && family.notificationGroupId === groupId) return ok({ familyName: family.name });

    const currentGroupId = family.notificationGroupId;
    const previous = currentGroupId
      ? await notificationGroupRepository.findByGroupId(currentGroupId)
      : undefined;
    const deletePreviousGroup = previous?.familyId === ctx.familyId;

    if (!groupNameFetched) {
      groupNameFetched = true;
      const summary = await lineApiService.getGroupSummary(groupId);
      if (summary.ok) {
        groupName = [...summary.value.groupName].slice(0, GROUP_NAME_MAX_LENGTH).join('');
      } else {
        logger.warn({ event: 'GROUP_SUMMARY_FAILED', groupId, reason: summary.reason });
      }
    }

    const outcome = await familyRepository.registerNotificationGroup({
      familyId: ctx.familyId,
      group: {
        groupId,
        familyId: ctx.familyId,
        ...(groupName ? { groupName } : {}),
        registeredByUserId: ctx.userId,
        registeredAt: now.toISOString(),
      },
      ...(currentGroupId ? { currentGroupId } : {}),
      deletePreviousGroup,
    });
    if (outcome === 'registered') {
      logger.info({
        event: 'NOTIFICATION_GROUP_REGISTERED',
        groupId,
        familyId: ctx.familyId,
        userId: ctx.userId,
        ...(deletePreviousGroup && currentGroupId ? { replacedGroupId: currentGroupId } : {}),
        groupNameFetched: groupName !== undefined,
      });
      return ok({ familyName: family.name });
    }
    if (outcome === 'group-taken') {
      // 別の家族が先に登録した。やり直しの回数には数えず、読み直して理由を返す（暴走しないよう上限あり）
      groupTaken++;
      if (groupTaken > MAX_REGISTER_ATTEMPTS) break;
    } else {
      attempt++;
    }
  }
  return err('INTERNAL');
}

/** 古い leave の判定に持たせる時計のずれの余裕（Lambda の時刻と LINE の timestamp のずれ。ミリ秒） */
const STALE_LEAVE_MARGIN_MS = 5000;

/** 解除の取引が競合で断られたとき、読み直してやり直す回数（最初の 1 回のあとに 1 回だけ。reliability-design.md の「解除」） */
const MAX_UNREGISTER_ATTEMPTS = 2;

/**
 * グループの家族を決める（グループの操作の入口 3。家族を決める前に使う窓口）。
 * 登録されていなければ GROUP_NOT_REGISTERED。強い整合性で読む。
 */
export async function findFamilyByGroup(
  groupId: string,
): Promise<Result<{ familyId: string }, 'GROUP_NOT_REGISTERED'>> {
  const group = await notificationGroupRepository.findByGroupId(groupId);
  return group ? ok({ familyId: group.familyId }) : err('GROUP_NOT_REGISTERED');
}

/**
 * 公式アカウントがグループから外された（C6 unregisterNotificationGroupByGroup、F3、BR4.9）。
 * 家族はグループの記録から決まる。順番（reliability-design.md の「解除」）:
 * 1. グループの記録を強い整合性で読む。なければ何もしない。登録がイベントの時刻より後なら古い leave として何もしない
 * 2. グループの Delete と家族の notificationGroupId の削除を 1 つの取引で書く
 * 3. 競合で断られたら読み直して 1 回だけやり直す。ほかの Code・やり直しても断られたら投げる（500 で LINE の再送に任せる）
 */
export async function unregisterNotificationGroupByGroup(
  groupId: string,
  eventTimestampMs?: number,
): Promise<void> {
  for (let attempt = 0; attempt < MAX_UNREGISTER_ATTEMPTS; attempt++) {
    const group = await notificationGroupRepository.findByGroupId(groupId);
    if (!group) {
      logger.info({
        event: 'NOTIFICATION_GROUP_UNREGISTER_SKIPPED',
        groupId,
        reason: 'not-registered',
      });
      return;
    }
    if (
      eventTimestampMs !== undefined &&
      Date.parse(group.registeredAt) - STALE_LEAVE_MARGIN_MS > eventTimestampMs
    ) {
      logger.info({
        event: 'NOTIFICATION_GROUP_UNREGISTER_SKIPPED',
        groupId,
        reason: 'stale-leave',
      });
      return;
    }
    const outcome = await familyRepository.unregisterNotificationGroup({
      groupId,
      familyId: group.familyId,
    });
    if (outcome === 'unregistered') {
      logger.info({
        event: 'NOTIFICATION_GROUP_UNREGISTERED',
        groupId,
        familyId: group.familyId,
      });
      return;
    }
    // 断られた。家族がもうこのグループを指していないだけなら、グループの記録だけを消して終える
    const family = await familyRepository.findById(group.familyId, { consistent: true });
    if (family && family.notificationGroupId !== groupId) {
      await notificationGroupRepository.deleteRecord(groupId, group.familyId);
      logger.info({
        event: 'NOTIFICATION_GROUP_UNREGISTERED',
        groupId,
        familyId: group.familyId,
        familyPointerMismatch: true,
      });
      return;
    }
  }
  throw new Error('お知らせ先の解除の取引が、やり直しても断られました');
}

/**
 * 家族のお知らせ先のグループ ID（C6 getNotificationGroup。U10 が push の宛先に使う）。なければ NOTIFICATION_GROUP_NOT_REGISTERED。
 * 画面には返さない（画面用は getNotificationGroupView）。
 */
export async function getNotificationGroup(
  ctx: FamilyContext,
): Promise<Result<string, 'NOTIFICATION_GROUP_NOT_REGISTERED'>> {
  const family = await familyRepository.findById(ctx.familyId, { consistent: true });
  if (!family) throw new Error(`利用者の家族の記録が見つかりません: ${ctx.familyId}`);
  return family.notificationGroupId
    ? ok(family.notificationGroupId)
    : err('NOTIFICATION_GROUP_NOT_REGISTERED');
}

/** 画面用のお知らせ先（C6 getNotificationGroupView）。グループ ID は返さない。 */
export async function getNotificationGroupView(
  ctx: FamilyContext,
): Promise<Result<NotificationGroupView, 'NOTIFICATION_GROUP_NOT_REGISTERED'>> {
  const found = await getNotificationGroup(ctx);
  if (!found.ok) return found;
  const group = await notificationGroupRepository.findByGroupId(found.value);
  if (!group || group.familyId !== ctx.familyId) return err('NOTIFICATION_GROUP_NOT_REGISTERED');
  return ok({ groupName: group.groupName ?? null, registeredAt: group.registeredAt });
}

/** 最初の画面の情報（C1 GET /me）。家族に入っていなければ family は null。 */
export async function getMe(userId: string): Promise<Result<Me, 'NOT_FOUND'>> {
  const user = await userRepository.findById(userId);
  if (!user) return err('NOT_FOUND');
  if (!user.familyId || !user.role) {
    return ok({ userId: user.userId, displayName: user.displayName, family: null });
  }
  const family = await familyRepository.findById(user.familyId);
  if (!family) {
    // 家族と利用者は一緒に書かれるので、ここに来るのは記録の食い違い。思いがけない失敗として扱う
    throw new Error(`利用者の家族の記録が見つかりません: ${user.familyId}`);
  }
  return ok({
    userId: user.userId,
    displayName: user.displayName,
    // お知らせ先のグループは U3 で登録する。U1 では常に未登録
    family: {
      familyId: family.familyId,
      name: family.name,
      role: user.role,
      notificationGroupRegistered: false,
    },
  });
}
