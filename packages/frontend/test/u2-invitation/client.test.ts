import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acceptInvitation,
  ApiFailure,
  createInvitation,
  getCurrentInvitation,
  listMembers,
  previewInvitation,
} from '../../src/api/client';

const TOKEN = 'abcdefghijklmnopqrstuv';
const KEY = '11111111-1111-4111-8111-111111111111';
let fetchMock: ReturnType<typeof vi.fn>;

function respond(status: number, body?: unknown): void {
  fetchMock.mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  );
}
function lastCall(): { path: string; init: RequestInit; headers: Headers } {
  const [path, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { path, init, headers: new Headers(init.headers) };
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('U2 の画面用 API の呼び出し', () => {
  it('listMembers は GET /v1/family/members にトークンを付ける', async () => {
    respond(200, [{ userId: 'u', displayName: '花子', role: 'admin' }]);
    await expect(listMembers('tok')).resolves.toHaveLength(1);
    const call = lastCall();
    expect(call.path).toBe('/v1/family/members');
    expect(call.init.method).toBe('GET');
    expect(call.headers.get('Authorization')).toBe('Bearer tok');
  });
  it('getCurrentInvitation は null も返せる', async () => {
    respond(200, null);
    await expect(getCurrentInvitation('tok')).resolves.toBeNull();
    expect(lastCall().path).toBe('/v1/family/invitation');
  });
  it('createInvitation は Idempotency-Key を付けて POST する', async () => {
    respond(201, { url: 'https://x', expiresAt: '2026-11-02T00:00:00.000Z' });
    await createInvitation('tok', KEY);
    const call = lastCall();
    expect(call.path).toBe('/v1/family/invitations');
    expect(call.init.method).toBe('POST');
    expect(call.headers.get('Idempotency-Key')).toBe(KEY);
  });
  it('previewInvitation は印をパスに入れて GET し、開くだけで POST しない', async () => {
    respond(200, { familyName: '田中家', expiresAt: '2026-11-02T00:00:00.000Z' });
    await previewInvitation('tok', TOKEN);
    expect(lastCall().path).toBe(`/v1/invitations/${TOKEN}`);
    expect(lastCall().init.method).toBe('GET');
  });
  it('acceptInvitation は /accept に Idempotency-Key を付けて POST する', async () => {
    respond(200, { familyId: 'f', name: '田中家', role: 'child' });
    await acceptInvitation('tok', TOKEN, KEY);
    const call = lastCall();
    expect(call.path).toBe(`/v1/invitations/${TOKEN}/accept`);
    expect(call.init.method).toBe('POST');
    expect(call.headers.get('Idempotency-Key')).toBe(KEY);
  });
  it('印は URL に使える形に符号化する', async () => {
    respond(200, { familyName: 'x', expiresAt: 'y' });
    await previewInvitation('tok', 'a/b?c');
    expect(lastCall().path).toBe('/v1/invitations/a%2Fb%3Fc');
  });
  it('409 の理由を ApiFailure で返す', async () => {
    respond(409, { error: { reason: 'INVITATION_INVALID' } });
    await expect(previewInvitation('tok', TOKEN)).rejects.toMatchObject({
      status: 409,
      reason: 'INVITATION_INVALID',
    });
  });
  it('通信の失敗は status 0 の ApiFailure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const error = await acceptInvitation('tok', TOKEN, KEY).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiFailure);
    expect(error).toMatchObject({ status: 0, reason: 'SERVICE_TEMPORARILY_UNAVAILABLE' });
  });
});
