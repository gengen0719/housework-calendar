/** C5の通知入力。運用入力や家族の指定とは分ける。 */
export type NotificationKind = 'dailyReminder' | 'monthlySummary';
export interface NotificationTrigger {
  kind: NotificationKind;
  targetDate: string;
}
export type NotificationState = 'prepared' | 'sending' | 'sent' | 'skipped' | 'failed' | 'expired';
export type NotificationReason =
  | 'unregistered'
  | 'confirmed'
  | 'empty'
  | 'destinationChanged'
  | 'read'
  | 'store'
  | 'connection'
  | 'timeout'
  | 'rateLimit'
  | 'server'
  | 'permanent'
  | 'invalid'
  | 'oversize'
  | 'missingPayload'
  | 'attempts'
  | 'deadline'
  | 'runMissing'
  | 'queueAge'
  | 'cleanup'
  | 'backup'
  | 'internal';
