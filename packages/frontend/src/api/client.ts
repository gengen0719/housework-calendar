import type {
  CreateFamilyRequest,
  CreateFamilyResponse,
  CreateSessionRequest,
  CreateSessionResponse,
  AssignmentView,
  RecordDutyRequest,
  RecordDutyResponse,
  ChoreType,
  ChoreTypeInput,
  InvitationPreview,
  InvitationView,
  Duty,
  Me,
  MeFamily,
  Member,
  MonthCalendar,
  NotificationGroupView,
  Reason,
  SaveAssignmentRequest,
} from '@housework/shared';
import { IDEMPOTENCY_KEY_HEADER, isReason } from '@housework/shared';

/** 画面用 API の失敗。通信そのものの失敗は status 0、理由は SERVICE_TEMPORARILY_UNAVAILABLE。 */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly reason: Reason,
    /** 失敗の補足（例: 名前が重なった相手が「使う」か。U4） */
    readonly details?: Record<string, unknown>,
  ) {
    super(`${status} ${reason}`);
    this.name = 'ApiFailure';
  }
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  options: {
    token?: string;
    body?: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch {
    throw new ApiFailure(0, 'SERVICE_TEMPORARILY_UNAVAILABLE');
  }

  if (!response.ok) {
    let reason: Reason = 'INTERNAL';
    let details: Record<string, unknown> | undefined;
    try {
      const parsed = (await response.json()) as {
        error?: { reason?: unknown; details?: unknown };
      };
      const candidate = parsed.error?.reason;
      if (typeof candidate === 'string' && isReason(candidate)) reason = candidate;
      const rawDetails = parsed.error?.details;
      if (typeof rawDetails === 'object' && rawDetails !== null) {
        details = rawDetails as Record<string, unknown>;
      }
    } catch {
      // 本文が読めなければ INTERNAL のまま
    }
    throw new ApiFailure(response.status, reason, details);
  }
  if (response.status === 204) return undefined as T;
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

const choreTypePath = (choreTypeId: string) => `/v1/chore-types/${encodeURIComponent(choreTypeId)}`;

/** お手伝いの種類の一覧（家族のメンバー全員が見られる。「使う」が先、「使わない」があと。BR5.11） */
export function listChoreTypes(token: string): Promise<ChoreType[]> {
  return request('GET', '/v1/chore-types', { token });
}

/** 種類を登録する（管理者だけ。識別子は操作ごとに 1 回だけ作り、送り直しでも同じ値を使う） */
export function createChoreType(
  token: string,
  input: ChoreTypeInput,
  idempotencyKey: string,
): Promise<ChoreType> {
  return request('POST', '/v1/chore-types', {
    token,
    body: input,
    headers: idempotent(idempotencyKey),
  });
}

/** 名前・単価・説明を変える（管理者だけ。「使う」「使わない」は含めない） */
export function updateChoreType(
  token: string,
  choreTypeId: string,
  input: ChoreTypeInput,
): Promise<ChoreType> {
  return request('PUT', choreTypePath(choreTypeId), { token, body: input });
}

/** 「使う」「使わない」を切り替える（管理者だけ。BR5.8） */
export function setChoreTypeActive(
  token: string,
  choreTypeId: string,
  active: boolean,
): Promise<ChoreType> {
  return request('PATCH', choreTypePath(choreTypeId), { token, body: { active } });
}

/** 種類を消す（管理者だけ。使われたことがあれば 409） */
export function deleteChoreType(token: string, choreTypeId: string): Promise<void> {
  return request('DELETE', choreTypePath(choreTypeId), { token });
}

const monthPath = (month: string) => `/v1/months/${encodeURIComponent(month)}`;

/** 月のカレンダー（家族のメンバー全員が見られる。signal で古い月の要求を取り消す。NFR7.20） */
export function getMonthCalendar(
  token: string,
  month: string,
  signal?: AbortSignal,
): Promise<MonthCalendar> {
  return request('GET', `${monthPath(month)}/calendar`, {
    token,
    ...(signal ? { signal } : {}),
  });
}

/** 月の割り当て（管理者だけ。なければ exists が false） */
export function getAssignment(
  token: string,
  month: string,
  signal?: AbortSignal,
): Promise<AssignmentView> {
  return request('GET', `${monthPath(month)}/assignment`, {
    token,
    ...(signal ? { signal } : {}),
  });
}

/** 月の割り当てを保存する（管理者だけ）。応答は保存後のカレンダー */
export function saveAssignment(
  token: string,
  month: string,
  body: SaveAssignmentRequest,
): Promise<MonthCalendar> {
  return request('PUT', `${monthPath(month)}/assignment`, { token, body });
}

/** 日ごとの担当の子供を変える（管理者だけ）。応答は変えたあとの担当 */
export function changeDutyChild(token: string, dutyId: string, childUserId: string): Promise<Duty> {
  return request('PATCH', `/v1/duties/${encodeURIComponent(dutyId)}`, {
    token,
    body: { childUserId },
  });
}

/** 担当を記録する（子供が自分の「未」の担当を記録。U6）。見せた時点の version を送る。応答は記録後の担当 */
export function recordDuty(
  token: string,
  dutyId: string,
  body: RecordDutyRequest,
  signal?: AbortSignal,
): Promise<RecordDutyResponse> {
  return request('POST', `/v1/duties/${encodeURIComponent(dutyId)}/record`, {
    token,
    body,
    ...(signal ? { signal } : {}),
  });
}
