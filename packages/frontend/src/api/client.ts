import type {
  CreateFamilyRequest,
  CreateFamilyResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  InvitationPreview,
  InvitationView,
  Me,
  MeFamily,
  Member,
  NotificationGroupView,
  Reason,
} from '@housework/shared';
import { IDEMPOTENCY_KEY_HEADER, isReason } from '@housework/shared';

/** 画面用 API の失敗。通信そのものの失敗は status 0、理由は SERVICE_TEMPORARILY_UNAVAILABLE。 */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly reason: Reason,
  ) {
    super(`${status} ${reason}`);
    this.name = 'ApiFailure';
  }
}

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  options: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    throw new ApiFailure(0, 'SERVICE_TEMPORARILY_UNAVAILABLE');
  }

  if (!response.ok) {
    let reason: Reason = 'INTERNAL';
    try {
      const parsed = (await response.json()) as { error?: { reason?: unknown } };
      const candidate = parsed.error?.reason;
      if (typeof candidate === 'string' && isReason(candidate)) reason = candidate;
    } catch {
      // 本文が読めなければ INTERNAL のまま
    }
    throw new ApiFailure(response.status, reason);
  }
  return (await response.json()) as T;
}

export function createSession(idToken: string): Promise<CreateSessionResponse> {
  const body: CreateSessionRequest = { idToken };
  return request('POST', '/v1/sessions', { body });
}

export function getMe(token: string): Promise<Me> {
  return request('GET', '/v1/me', { token });
}

/** idempotencyKey は操作ごとに 1 回だけ作り、送り直しでも同じ値を使う（BR2.8）。 */
export function createFamily(
  token: string,
  name: string,
  idempotencyKey: string,
): Promise<CreateFamilyResponse> {
  const body: CreateFamilyRequest = { name };
  return request('POST', '/v1/families', {
    token,
    body,
    headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
  });
}

const idempotent = (key: string) => ({ [IDEMPOTENCY_KEY_HEADER]: key });
const invitationPath = (invitationToken: string) =>
  `/v1/invitations/${encodeURIComponent(invitationToken)}`;

/** メンバーの一覧（家族のメンバー全員が見られる。BR3.11） */
export function listMembers(token: string): Promise<Member[]> {
  return request('GET', '/v1/family/members', { token });
}

/** お知らせ先のグループの名前と登録した時刻。なければ null（家族のメンバー全員が見られる。グループ ID は返らない） */
export function getNotificationGroup(token: string): Promise<NotificationGroupView | null> {
  return request('GET', '/v1/family/notification-group', { token });
}

/** いま使える招待。なければ null（管理者だけ。BR3.12） */
export function getCurrentInvitation(token: string): Promise<InvitationView | null> {
  return request('GET', '/v1/family/invitation', { token });
}

/** 招待用のリンクを作る（作り直しも同じ。管理者だけ。BR3.5 のため識別子が要る） */
export function createInvitation(token: string, idempotencyKey: string): Promise<InvitationView> {
  return request('POST', '/v1/family/invitations', {
    token,
    headers: idempotent(idempotencyKey),
  });
}

/** 招待を開く。開いただけでは参加しない（BR3.9） */
export function previewInvitation(
  token: string,
  invitationToken: string,
): Promise<InvitationPreview> {
  return request('GET', invitationPath(invitationToken), { token });
}

/** 招待に参加する。応答は GET /v1/me の family と同じ形 */
export function acceptInvitation(
  token: string,
  invitationToken: string,
  idempotencyKey: string,
): Promise<MeFamily> {
  return request('POST', `${invitationPath(invitationToken)}/accept`, {
    token,
    headers: idempotent(idempotencyKey),
  });
}
