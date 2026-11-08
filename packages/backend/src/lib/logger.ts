/** 構造化ログ（JSON の 1 行）。秘密の情報・トークン・本文は入れない（NFR2.5〜NFR2.8、NFR5.4）。 */
export type LogLevel = 'info' | 'warn' | 'error';

/** この名前に当てはまる項目は、値を伏せる。 */
const REDACTED_KEY = /secret|token|authorization|signature|password|body|cookie/i;

/** 名前がちょうど一致する項目も伏せる（グループの名前・会話の本文・表示名。NFR5.8、NFR5.9）。 */
const REDACTED_EXACT_KEY = /^(groupName|text|display_?name)$/i;

/** 印の先頭 4 文字だけを書く項目（招待のログ。NFR5.7）。印の全体ではないので伏せない。 */
const ALLOWED_KEY = 'tokenPrefix';

/**
 * ログに書く項目。`token` という名前の項目は型で受け付けない（印の全体を書かせない。NFR4.26）。
 * `groupName`・`text`・`displayName` も同じ（グループの名前・会話の本文・表示名を書かせない。NFR5.8）。
 */
export type LogData = Record<string, unknown> & {
  token?: never;
  groupName?: never;
  text?: never;
  displayName?: never;
};

let currentRequestId: string | undefined;

export function setRequestId(requestId: string | undefined): void {
  currentRequestId = requestId;
}

export function getRequestId(): string | undefined {
  return currentRequestId;
}

function redact(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (depth > 4) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const result: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    const redacted =
      key !== ALLOWED_KEY && (REDACTED_KEY.test(key) || REDACTED_EXACT_KEY.test(key));
    result[key] = redacted ? '[REDACTED]' : redact(inner, depth + 1);
  }
  return result;
}

export function log(level: LogLevel, data: LogData): void {
  const line = JSON.stringify({
    level,
    timestamp: new Date().toISOString(),
    env: process.env.ENV,
    entry: process.env.ENTRY,
    requestId: currentRequestId,
    ...(redact(data) as Record<string, unknown>),
  });
  console.log(line);
}

export const logger = {
  info: (data: LogData) => log('info', data),
  warn: (data: LogData) => log('warn', data),
  error: (data: LogData) => log('error', data),
};

/** 思いがけない失敗をログに出せる形にする（スタックは含めるが、秘密の情報は含めない）。 */
export function describeError(err: unknown): { error: string; stack?: string } {
  if (err instanceof Error)
    return { error: err.message, ...(err.stack ? { stack: err.stack } : {}) };
  return { error: String(err) };
}
