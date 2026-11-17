import { jstDateOf, type NotificationTrigger } from '@housework/shared';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export function parseTrigger(value: unknown): NotificationTrigger {
  if (!value || typeof value !== 'object') throw new Error('INVALID_NOTIFICATION');
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).sort().join(',') !== 'kind,targetDate' ||
    !['dailyReminder', 'monthlySummary'].includes(String(input.kind)) ||
    typeof input.targetDate !== 'string' ||
    !DATE.test(input.targetDate)
  )
    throw new Error('INVALID_NOTIFICATION');
  const date = new Date(`${input.targetDate}T00:00:00+09:00`);
  if (!Number.isFinite(date.getTime()) || jstDateOf(date) !== input.targetDate)
    throw new Error('INVALID_NOTIFICATION');
  if (
    input.kind === 'monthlySummary' &&
    jstDateOf(new Date(date.getTime() + 86400000)).slice(0, 7) === input.targetDate.slice(0, 7)
  )
    throw new Error('NOT_MONTH_END');
  return { kind: input.kind as NotificationTrigger['kind'], targetDate: input.targetDate };
}
export function notificationWindow(trigger: NotificationTrigger, now: Date) {
  const scheduledAt = Date.parse(
    `${trigger.targetDate}T${trigger.kind === 'dailyReminder' ? '16' : '21'}:00:00+09:00`,
  );
  const expiresAt = scheduledAt + 15 * 60 * 1000;
  return {
    scheduledAt,
    expiresAt,
    status:
      now.getTime() < scheduledAt
        ? ('early' as const)
        : now.getTime() >= expiresAt
          ? ('expired' as const)
          : ('active' as const),
  };
}
/** Schedulerだけのアダプター。月末でない21時は正常省略する。 */
export function fromScheduledTime(
  kind: NotificationTrigger['kind'],
  scheduledTime: string,
): NotificationTrigger | undefined {
  const instant = new Date(scheduledTime);
  if (!Number.isFinite(instant.getTime())) throw new Error('INVALID_SCHEDULE');
  const targetDate = jstDateOf(instant);
  if (
    kind === 'monthlySummary' &&
    jstDateOf(new Date(Date.parse(`${targetDate}T00:00:00+09:00`) + 86400000)).slice(0, 7) ===
      targetDate.slice(0, 7)
  )
    return undefined;
  const trigger = parseTrigger({ kind, targetDate });
  if (notificationWindow(trigger, instant).scheduledAt !== instant.getTime())
    throw new Error('INVALID_SCHEDULE');
  return trigger;
}
