import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/lib/errors';
import { errorResponse, json } from '../../src/lib/http';

describe('lib/http の json（NFR4.92、ADR-U9-05）', () => {
  it('追加のヘッダーを渡さないときは content-type だけ（前と同じ）', () => {
    expect(json(200, { a: 1 })).toEqual({
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"a":1}',
    });
  });

  it('追加のヘッダーを渡すと、content-type に加えて付く', () => {
    const result = json(200, {}, { 'cache-control': 'no-store' });
    expect(result.headers).toEqual({
      'content-type': 'application/json',
      'cache-control': 'no-store',
    });
  });

  it('追加のヘッダーで content-type を渡しても application/json が勝つ', () => {
    const result = json(200, {}, { 'content-type': 'text/plain' });
    expect(result.headers).toEqual({ 'content-type': 'application/json' });
  });

  it('errorResponse の戻りには cache-control が付かない', () => {
    const result = errorResponse(new ApiError(422, 'INVALID_MONTH'));
    expect(result.statusCode).toBe(422);
    expect(result.headers).toEqual({ 'content-type': 'application/json' });
  });

  it('undefined を渡しても従来と同じ', () => {
    expect(json(204, null, undefined).headers).toEqual({ 'content-type': 'application/json' });
  });
});
