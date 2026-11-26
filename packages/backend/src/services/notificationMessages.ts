import { formatYen, type NotificationReason, type Allowance } from '@housework/shared';
import type { SystemContext } from '../middleware/requireMembership';
import * as family from './familyMemberService';
import * as calendar from './calendarService';
import * as chores from './choreTypeService';
import * as allowance from './allowanceService';
import { getConfig } from '../lib/config';
import { mapWithConcurrency } from '../lib/promise';

export class NotificationContentError extends Error {
  constructor(readonly reason: NotificationReason) {
    super(reason);
  }
}
export const normalizeName = (value: string) =>
  Array.from(value)
    .map((c) => {
      const n = c.charCodeAt(0);
      return n < 32 || n === 127 || n === 8232 || n === 8233 ? ' ' : c;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
export function checkMessage(text: string): string {
  if (text.length > 5000) throw new NotificationContentError('oversize');
  return text;
}
export interface DailyLine {
  dutyId: string;
  choreTypeId: string;
  choreName: string;
  displayName: string;
  status: 'todo' | 'done' | 'skipped';
}
export function buildDailyMessage(
  date: string,
  lines: readonly DailyLine[],
  liffUrl: string,
): string {
  const labels = { todo: '未', done: '済', skipped: '×' };
  return checkMessage(
    [
      `今日のお手伝い ${date}`,
      ...[...lines]
        .sort(
          (a, b) => a.dutyId.localeCompare(b.dutyId) || a.choreTypeId.localeCompare(b.choreTypeId),
        )
        .map(
          (l) =>
            `${normalizeName(l.choreName)}・${normalizeName(l.displayName)}・${labels[l.status]}`,
        ),
      '',
      liffUrl,
    ].join('\n'),
  );
}
export function buildSummaryMessage(
  month: string,
  children: readonly Pick<Allowance, 'displayName' | 'total'>[],
): string {
  return checkMessage(
    [
      `${Number(month.slice(5))}月のお小遣い`,
      ...children.map((c) => `${normalizeName(c.displayName)} ${formatYen(c.total)}`),
    ].join('\n'),
  );
}
export async function prepareContent(
  ctx: SystemContext,
  kind: 'dailyReminder' | 'monthlySummary',
  date: string,
): Promise<{ text?: string; reason?: NotificationReason }> {
  if (kind === 'monthlySummary') {
    const values = await allowance.getAllowances(ctx, date.slice(0, 7), { emitLogs: false });
    return values.length
      ? { text: buildSummaryMessage(date.slice(0, 7), values) }
      : { reason: 'empty' };
  }
  const [confirmed, duties, members, types] = await Promise.all([
    calendar.isMonthConfirmed(ctx, date.slice(0, 7)),
    calendar.listDutiesOn(ctx, date),
    family.listMembers(ctx),
    chores.list(ctx),
  ]);
  if (confirmed) return { reason: 'confirmed' };
  if (!duties.length) return { reason: 'empty' };
  const names = new Map(members.map((m) => [m.userId, m.displayName]));
  const typeNames = new Map(types.map((t) => [t.choreTypeId, t.name]));
  await mapWithConcurrency(
    [...new Set(duties.map((d) => d.childUserId))].filter((id) => !names.has(id)),
    10,
    async (id) => {
      const n = await family.findDisplayName(ctx, id);
      names.set(id, n.ok ? n.value : '名前が分からない子供');
    },
  );
  const { liffUrl } = await getConfig();
  return {
    text: buildDailyMessage(
      date,
      duties.map((d) => ({
        dutyId: d.dutyId,
        choreTypeId: d.choreTypeId,
        status: d.status,
        choreName: typeNames.get(d.choreTypeId) ?? '不明なお手伝い',
        displayName: names.get(d.childUserId) ?? '名前が分からない子供',
      })),
      liffUrl,
    ),
  };
}
