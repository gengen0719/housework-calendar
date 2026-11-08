const PARAM_NAME = 'invitation';
/** 招待の印の形（22 文字の base64url。NFR4.18） */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

/** URL の `invitation` を読み、形が正しいときだけ返す。URL は変えない。 */
export function readInvitationParam(search: string = window.location.search): string | undefined {
  const value = new URLSearchParams(search).get(PARAM_NAME);
  return value !== null && TOKEN_PATTERN.test(value) ? value : undefined;
}

/** 履歴を増やさずに、URL から `invitation` を外す（印を履歴や共有に残さない）。 */
export function removeInvitationParam(): void {
  const { pathname, search, hash } = window.location;
  const params = new URLSearchParams(search);
  if (!params.has(PARAM_NAME)) return;
  params.delete(PARAM_NAME);
  const rest = params.toString();
  window.history.replaceState(
    window.history.state,
    '',
    `${pathname}${rest ? `?${rest}` : ''}${hash}`,
  );
}
