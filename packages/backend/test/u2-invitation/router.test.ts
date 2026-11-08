import { describe, expect, it } from 'vitest';
import { matchRoute } from '../../src/lib/router';
import {
  FAKE_MIXED_CASE_INVITE_TOKEN,
  ROUTE_KEY_INVITATION_ACCEPT,
  ROUTE_KEY_INVITATION_PREVIEW,
} from '../fixtures/fakeSecrets';

const table = {
  'POST /v1/sessions': 'sessions',
  [ROUTE_KEY_INVITATION_PREVIEW]: 'preview',
  [ROUTE_KEY_INVITATION_ACCEPT]: 'accept',
  'GET /v1/invitations/mine': 'exact-mine',
};

describe('router: パスの型の照合', () => {
  it('完全に同じパスは、そのまま合う（params は空）', () => {
    expect(matchRoute(table, 'POST', '/v1/sessions')).toEqual({
      key: 'POST /v1/sessions',
      route: '/v1/sessions',
      handler: 'sessions',
      params: {},
    });
  });

  it(':name の部分が印として取り出され、route にはパスの型が入る', () => {
    const match = matchRoute(table, 'GET', '/v1/invitations/AbCdEfGhIjKlMnOpQrStUv');
    expect(match?.route).toBe('/v1/invitations/:token');
    expect(match?.params).toEqual({ token: FAKE_MIXED_CASE_INVITE_TOKEN });
    expect(match?.handler).toBe('preview');
  });

  it('末尾に続きがある型にも合う', () => {
    const match = matchRoute(table, 'POST', '/v1/invitations/AbCd/accept');
    expect(match?.route).toBe('/v1/invitations/:token/accept');
    expect(match?.params.token).toBe('AbCd');
  });

  it('完全一致を先に探す（型より優先）', () => {
    expect(matchRoute(table, 'GET', '/v1/invitations/mine')?.handler).toBe('exact-mine');
  });

  it('メソッドが違うと合わない', () => {
    expect(matchRoute(table, 'POST', '/v1/invitations/AbCd')).toBeUndefined();
  });

  it('区切りの数が違う・空の部分があるパスは合わない', () => {
    expect(matchRoute(table, 'GET', '/v1/invitations/')).toBeUndefined();
    expect(matchRoute(table, 'GET', '/v1/invitations/AbCd/extra')).toBeUndefined();
    expect(matchRoute(table, 'GET', '/v1/invitations')).toBeUndefined();
  });

  it('知らないパスは合わない', () => {
    expect(matchRoute(table, 'GET', '/v1/unknown')).toBeUndefined();
  });

  it('メソッドが未定義でも落ちない', () => {
    expect(matchRoute(table, undefined, '/v1/sessions')).toBeUndefined();
  });
});
