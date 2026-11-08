/** 構造化ログ（JSON の 1 行）。秘密の情報・トークン・本文は入れない（NFR2.5〜NFR2.8、NFR5.4）。 */
export type LogLevel = 'info' | 'warn' | 'error';

/** この名前に当てはまる項目は、値を伏せる。 */
const REDACTED_KEY = /secret|token|authorization|signature|password|body|cookie/i;

let currentRequestId: string | undefined;

export function setRequestId(requestId: string | undefined): void {
  currentRequestId = requestId;
}

export function getRequestId(): string | undefined {
  return currentRequestId;
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const result: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    result[key] = REDACTED_KEY.test(key) ? '[REDACTED]' : redact(inner, depth + 1);
  }
  return result;
}

export function log(level: LogLevel, data: Record<string, unknown>): void {
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
  info: (data: Record<string, unknown>) => log('info', data),
  warn: (data: Record<string, unknown>) => log('warn', data),
  error: (data: Record<string, unknown>) => log('error', data),
};

/** 思いがけない失敗をログに出せる形にする（スタックは含めるが、秘密の情報は含めない）。 */
export function describeError(err: unknown): { error: string; stack?: string } {
  if (err instanceof Error)
    return { error: err.message, ...(err.stack ? { stack: err.stack } : {}) };
  return { error: String(err) };
}
