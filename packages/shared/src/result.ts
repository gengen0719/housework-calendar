import type { Reason } from './reasons';

/** 部品の窓口の結果。業務の決まりで断るときは reason を返す（契約: 失敗の返し方）。 */
export type Ok<T> = { ok: true; value: T };
export type Err<R extends string = Reason> = { ok: false; reason: R };
export type Result<T, R extends string = Reason> = Ok<T> | Err<R>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<R extends string = Reason>(reason: R): Err<R> {
  return { ok: false, reason };
}

export function isOk<T, R extends string>(result: Result<T, R>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, R extends string>(result: Result<T, R>): result is Err<R> {
  return !result.ok;
}
