import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/lib/errors';
import { requireAdmin } from '../../src/middleware/requireAdmin';
import type { AuthContext } from '../../src/middleware/requireAuth';
import { requireMembership, type FamilyContext } from '../../src/middleware/requireMembership';
import { requireSameFamily } from '../../src/middleware/requireSameFamily';

function rejection(fn: () => unknown): ApiError {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error('断られるはずが通った');
}

const child: FamilyContext = { familyId: 'fam-1', userId: 'user-hanako', role: 'child' };
const admin: FamilyContext = { familyId: 'fam-1', userId: 'user-mother', role: 'admin' };

describe('requireMembership', () => {
  it('家族に入っている人から ctx（familyId、userId、role）を作る', () => {
    const auth: AuthContext = { userId: 'user-hanako', familyId: 'fam-1', role: 'child' };
    expect(requireMembership(auth)).toEqual(child);
  });

  it('管理者の役割もそのまま ctx に入る', () => {
    const auth: AuthContext = { userId: 'user-mother', familyId: 'fam-1', role: 'admin' };
    expect(requireMembership(auth).role).toBe('admin');
  });

  it('家族に入っていない人は 403 NOT_FAMILY_MEMBER', () => {
    const error = rejection(() => requireMembership({ userId: 'user-jiro' }));
    expect([error.status, error.reason]).toEqual([403, 'NOT_FAMILY_MEMBER']);
  });

  it('familyId だけ・role だけの食い違った記録も、メンバーとは認めない', () => {
    expect(rejection(() => requireMembership({ userId: 'u', familyId: 'fam-1' })).status).toBe(403);
    expect(rejection(() => requireMembership({ userId: 'u', role: 'admin' })).status).toBe(403);
  });

  it('家族の指定はセッションの利用者の記録から決まり、渡された値だけが ctx になる', () => {
    const ctx = requireMembership({ userId: 'user-hanako', familyId: 'fam-9', role: 'child' });
    expect(ctx.familyId).toBe('fam-9');
  });
});

describe('requireAdmin', () => {
  it('管理者なら ctx をそのまま返す', () => {
    expect(requireAdmin(admin)).toBe(admin);
  });

  it('子供は 403 ADMIN_ONLY', () => {
    const error = rejection(() => requireAdmin(child));
    expect([error.status, error.reason]).toEqual([403, 'ADMIN_ONLY']);
  });

  it('requireMembership のあとに重ねても、子供は断られる', () => {
    const error = rejection(() =>
      requireAdmin(requireMembership({ userId: 'u', familyId: 'fam-1', role: 'child' })),
    );
    expect(error.reason).toBe('ADMIN_ONLY');
  });

  it('メンバーでない人は管理者の確かめより前に NOT_FAMILY_MEMBER で断られる', () => {
    const error = rejection(() => requireAdmin(requireMembership({ userId: 'u' })));
    expect(error.reason).toBe('NOT_FAMILY_MEMBER');
  });

  it('管理者かどうかは role だけで決まる（ID は見ない）', () => {
    expect(requireAdmin({ ...admin, userId: 'anyone' }).userId).toBe('anyone');
  });
});

describe('requireSameFamily', () => {
  it('同じ家族の持ち物なら何も起きない', () => {
    expect(() => requireSameFamily(child, 'fam-1')).not.toThrow();
  });

  it('ほかの家族の持ち物は 404 NOT_FOUND', () => {
    const error = rejection(() => requireSameFamily(child, 'fam-other'));
    expect([error.status, error.reason]).toEqual([404, 'NOT_FOUND']);
  });

  it('持ち主が見つからない ID も、ほかの家族と同じ 404（存在を知らせない）', () => {
    const missing = rejection(() => requireSameFamily(child, undefined));
    const other = rejection(() => requireSameFamily(child, 'fam-other'));
    expect([missing.status, missing.reason, missing.details]).toEqual([
      other.status,
      other.reason,
      other.details,
    ]);
  });

  it('管理者でも、ほかの家族の持ち物は 404', () => {
    expect(rejection(() => requireSameFamily(admin, 'fam-other')).status).toBe(404);
  });

  it('空の文字列の家族 ID は一致しないので 404', () => {
    expect(rejection(() => requireSameFamily(child, '')).status).toBe(404);
  });
});
