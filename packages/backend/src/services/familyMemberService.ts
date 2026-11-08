import { randomUUID } from 'node:crypto';
import {
  err,
  FAMILY_NAME_MAX_LENGTH,
  FAMILY_NAME_MIN_LENGTH,
  ok,
  type FriendStatus,
  type Me,
  type MeFamily,
  type Result,
  type Role,
} from '@housework/shared';
import type { RequestRecord, User } from '../models';
import * as familyRepository from '../repositories/familyRepository';
import * as requestRecordRepository from '../repositories/requestRecordRepository';
import * as userRepository from '../repositories/userRepository';
import * as lineApiService from './lineApiService';

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

export async function getUserStatus(userId: string): Promise<Result<UserStatus, 'NOT_FOUND'>> {
  const user = await userRepository.findById(userId);
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

export type CreateFamilyFailure = 'NOT_FOUND' | 'INVALID_FAMILY_NAME' | 'ALREADY_IN_FAMILY';

function toResult(record: RequestRecord['result']): MeFamily {
  return { ...record };
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
  if (previous) return ok(toResult(previous.result));

  const trimmed = name.trim();
  const length = [...trimmed].length;
  if (length < FAMILY_NAME_MIN_LENGTH || length > FAMILY_NAME_MAX_LENGTH) {
    return err('INVALID_FAMILY_NAME');
  }

  const user = await userRepository.findById(userId);
  if (!user) return err('NOT_FOUND');
  if (user.familyId) return err('ALREADY_IN_FAMILY');

  const familyId = randomUUID();
  const result: RequestRecord['result'] = {
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
  return winner ? ok(toResult(winner.result)) : err('ALREADY_IN_FAMILY');
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
