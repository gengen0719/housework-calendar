/**
 * U9 のログの補助。`console.log`／`console.warn` に出る JSON の行を集め、
 * 目印の文字・数字が全行に含まれないことを確かめる。
 */
import { vi } from 'vitest';

export interface CapturedLogs {
  lines: Record<string, unknown>[];
  rows: (event: string) => Record<string, unknown>[];
  /** 集めた行を 1 つの文字列にしたもの（目印が含まれないことの確認用） */
  text: () => string;
  /** どれかの目印が全行のどこかに含まれていれば、その目印を返す */
  findLeak: (markers: readonly (string | number)[]) => string | number | undefined;
}

/** console.log／warn／info／error に出る JSON のログ行を集める。JSON でない行は集めない。 */
export function captureLogs(): CapturedLogs {
  const lines: Record<string, unknown>[] = [];
  const collect = (raw: unknown): void => {
    try {
      lines.push(JSON.parse(String(raw)) as Record<string, unknown>);
    } catch {
      // JSON でない行は集めない
    }
  };
  for (const method of ['log', 'warn', 'info', 'error'] as const) {
    vi.spyOn(console, method).mockImplementation(collect);
  }
  const text = (): string => lines.map((line) => JSON.stringify(line)).join('\n');
  return {
    lines,
    rows: (event) => lines.filter((line) => line.event === event),
    text,
    findLeak: (markers) => markers.find((marker) => text().includes(String(marker))),
  };
}
