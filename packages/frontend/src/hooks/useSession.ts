import { useCallback, useEffect, useRef, useState } from 'react';
import type { Me, Reason } from '@housework/shared';
import { ApiFailure, createFamily as postFamily, createSession, getMe } from '../api/client';
import { getIdToken, LoginRedirect } from '../liff/liffClient';

export type SessionState =
  | { kind: 'loading' }
  | { kind: 'redirecting' }
  | { kind: 'not-friend' }
  | { kind: 'not-member' }
  | { kind: 'error'; reason: Reason }
  | { kind: 'ready'; me: Me };

export type CreateFamilyOutcome = { ok: true } | { ok: false; reason: Reason };

function toState(e: unknown): SessionState {
  if (e instanceof LoginRedirect) return { kind: 'redirecting' };
  if (e instanceof ApiFailure) {
    if (e.reason === 'NOT_FRIEND') return { kind: 'not-friend' };
    if (e.reason === 'NOT_FAMILY_MEMBER') return { kind: 'not-member' };
    return { kind: 'error', reason: e.reason };
  }
  return { kind: 'error', reason: 'INTERNAL' };
}

/**
 * セッションと最初の画面の情報を持つ。
 * セッショントークンは useRef（メモリ）だけに持ち、ブラウザの保存場所には書かない（NFR4.3）。
 */
export function useSession() {
  const [state, setState] = useState<SessionState>({ kind: 'loading' });
  const tokenRef = useRef<string | undefined>(undefined);
  // 家族を作る操作ごとの識別子。通信の失敗で送り直すときは同じ値を使う（BR2.8）
  const pendingKeyRef = useRef<{ name: string; key: string } | undefined>(undefined);

  const issueSession = useCallback(async () => {
    const session = await createSession(await getIdToken());
    tokenRef.current = session.sessionToken;
  }, []);

  /** 401 なら ID トークンを取り直してセッションを出し直し、1 回だけ送り直す。 */
  const authorized = useCallback(
    async <T>(call: (token: string) => Promise<T>): Promise<T> => {
      if (!tokenRef.current) await issueSession();
      try {
        return await call(tokenRef.current as string);
      } catch (e) {
        if (!(e instanceof ApiFailure) || e.status !== 401) throw e;
        await issueSession();
        return await call(tokenRef.current as string);
      }
    },
    [issueSession],
  );

  // 最初の読み込み。画面を閉じたあとの結果は捨てる
  useEffect(() => {
    let active = true;
    authorized(getMe).then(
      (me) => active && setState({ kind: 'ready', me }),
      (e: unknown) => active && setState(toState(e)),
    );
    return () => {
      active = false;
    };
  }, [authorized]);

  /** 読み込み直す（「読み込み直す」ボタン） */
  const reload = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      setState({ kind: 'ready', me: await authorized(getMe) });
    } catch (e) {
      setState(toState(e));
    }
  }, [authorized]);

  const createFamily = useCallback(
    async (name: string): Promise<CreateFamilyOutcome> => {
      if (pendingKeyRef.current?.name !== name) {
        pendingKeyRef.current = { name, key: crypto.randomUUID() };
      }
      const { key } = pendingKeyRef.current;
      try {
        const family = await authorized((token) => postFamily(token, name, key));
        pendingKeyRef.current = undefined;
        setState((current) =>
          current.kind === 'ready' ? { kind: 'ready', me: { ...current.me, family } } : current,
        );
        return { ok: true };
      } catch (e) {
        const failure = toState(e);
        if (failure.kind === 'not-friend') {
          setState(failure);
          return { ok: false, reason: 'NOT_FRIEND' };
        }
        const reason = e instanceof ApiFailure ? e.reason : 'INTERNAL';
        // 返事が来た失敗（422・409 など）はその操作の終わり。通信の失敗だけ同じ識別子で送り直せる
        if (e instanceof ApiFailure && e.status !== 0 && e.status < 500) {
          pendingKeyRef.current = undefined;
        }
        return { ok: false, reason };
      }
    },
    [authorized],
  );

  return { state, reload, createFamily };
}
