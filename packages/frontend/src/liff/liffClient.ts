import liff from '@line/liff';

/** LINE ログインの画面へ移るため、ID トークンをまだ渡せない（ページが切り替わる）。 */
export class LoginRedirect extends Error {
  constructor() {
    super('redirecting to LINE Login');
    this.name = 'LoginRedirect';
  }
}

let initPromise: Promise<void> | undefined;

function ensureInit(): Promise<void> {
  // 失敗したときは次の呼び出しでやり直せるように、覚えたものを捨てる
  initPromise ??= liff.init({ liffId: import.meta.env.VITE_LIFF_ID ?? '' }).catch((e: unknown) => {
    initPromise = undefined;
    throw e;
  });
  return initPromise;
}

/** LIFF の初期化が終わるまで待つ（招待の印は初期化のあとに読む。NFR4.18）。 */
export function ensureReady(): Promise<void> {
  return ensureInit();
}

/**
 * LINE の ID トークンを返す。
 * LINE アプリの中では LIFF のまま、外のブラウザでは未ログインなら LINE ログインへ移る（BR）。
 */
export async function getIdToken(): Promise<string> {
  await ensureInit();
  if (!liff.isInClient() && !liff.isLoggedIn()) {
    liff.login();
    throw new LoginRedirect();
  }
  const token = liff.getIDToken();
  if (!token) throw new Error('ID token is not available (openid scope may be missing)');
  return token;
}
