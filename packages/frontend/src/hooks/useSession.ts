import { useCallback, useEffect, useRef, useState } from 'react';
import type { Me, MeFamily, Reason } from '@housework/shared';
import { ApiFailure, createFamily as postFamily, createSession, getMe } from '../api/client';
import { removeInvitationParam, readInvitationParam } from '../invitation/readInvitationParam';
import { ensureReady, getIdToken, LoginRedirect } from '../liff/liffClient';

export type SessionState =
  | { kind: 'loading' }
  | { kind: 'redirecting' }
  | { kind: 'not-friend' }
  | { kind: 'not-member' }
  | { kind: 'error'; reason: Reason }
  | { kind: 'ready'; me: Me };

/** 通信の呼び出し。401 なら取り直して 1 回だけ送り直す。 */
export type Authorized = <T>(call: (token: string) => Promise<T>) => Promise<T>;
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
  // 招待の印。メモリ（状態）にだけ持ち、ブラウザの保存場所には書かない（NFR4.18）
  const [invitation, setInvitation] = useState<string | undefined>(undefined);
  const tokenRef = useRef<string | undefined>(undefined);
  // 家族を作る操作ごとの識別子。通信の失敗で送り直すときは同じ値を使う（BR2.8）
  const pendingKeyRef = useRef<{ name: string; key: string } | undefined>(undefined);

  const issueSession = useCallback(async () => {
    const idToken = await getIdToken();
    // LINE ログインへ移る場合は、戻ってきた URL に印が要るので、ここまで外さない
    removeInvitationParam();
    const session = await createSession(idToken);
    tokenRef.current = session.sessionToken;
  }, []);

  /** 401 なら ID トークンを取り直してセッションを出し直し、1 回だけ送り直す。 */
  const authorized: Authorized = useCallback(
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
    (async () => {
      // 印は LIFF の初期化のあとに読む（NFR4.18）
      await ensureReady();
      const found = readInvitationParam();
      if (active && found) setInvitation(found);
      return authorized(getMe);
    })().then(
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

  /** 招待の画面を閉じる（「カレンダーへ」） */
  const closeInvitation = useCallback(() => setInvitation(undefined), []);

  /** 招待に参加できた。家族に入った状態にして、招待の画面を閉じる */
  const joined = useCallback((family: MeFamily) => {
    setInvitation(undefined);
    setState((current) =>
      current.kind === 'ready' ? { kind: 'ready', me: { ...current.me, family } } : current,
    );
  }, []);

  return { state, reload, createFamily, authorized, invitation, closeInvitation, joined };
}
