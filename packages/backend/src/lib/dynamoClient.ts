import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { requireEnv } from './config';

/** グローバルで 1 つだけ作る（コールドスタートの対策。NFR7.4）。 */
export const docClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

/** テーブル名は環境変数から読む。 */
export const tables = {
  users: () => requireEnv('USERS_TABLE'),
  families: () => requireEnv('FAMILIES_TABLE'),
  processedLineEvents: () => requireEnv('PROCESSED_LINE_EVENTS_TABLE'),
  requestRecords: () => requireEnv('REQUEST_RECORDS_TABLE'),
  /** 画面用の Lambda だけが持つ（U2） */
  invitations: () => requireEnv('INVITATIONS_TABLE'),
  /** お知らせ先のグループ（U3）。LINE 用と画面用の両方の Lambda が持つ */
  notificationGroups: () => requireEnv('NOTIFICATION_GROUPS_TABLE'),
};
