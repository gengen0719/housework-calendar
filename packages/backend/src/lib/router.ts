/**
 * 画面用 API のパスの型の照合（NFR4.26）。キーは `<METHOD> <パスの型>`。
 * パスの型の `:name` は、空でなく `/` を含まない 1 区切りに合う。完全一致を先に探し、型は後に探す。
 * ログには、パスそのものではなく合った型（`route`）を書く（招待の印をログに出さないため）。
 */
export interface RouteMatch<T> {
  /** 表のキー（`<METHOD> <パスの型>`） */
  key: string;
  /** 合ったパスの型。ログの path にはこれを書く */
  route: string;
  handler: T;
  params: Record<string, string>;
}

function matchPattern(pattern: string, path: string): Record<string, string> | undefined {
  const patternParts = pattern.split('/');
  const pathParts = path.split('/');
  if (patternParts.length !== pathParts.length) return undefined;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const expected = patternParts[i] as string;
    const actual = pathParts[i] as string;
    if (expected.startsWith(':')) {
      if (actual === '') return undefined;
      params[expected.slice(1)] = actual;
    } else if (expected !== actual) {
      return undefined;
    }
  }
  return params;
}

export function matchRoute<T>(
  table: Record<string, T>,
  method: string | undefined,
  path: string,
): RouteMatch<T> | undefined {
  if (!method) return undefined;
  const exactKey = `${method} ${path}`;
  if (Object.prototype.hasOwnProperty.call(table, exactKey)) {
    return { key: exactKey, route: path, handler: table[exactKey] as T, params: {} };
  }
  const prefix = `${method} `;
  for (const [key, handler] of Object.entries(table)) {
    if (!key.startsWith(prefix) || !key.includes(':')) continue;
    const route = key.slice(prefix.length);
    const params = matchPattern(route, path);
    if (params) return { key, route, handler, params };
  }
  return undefined;
}
