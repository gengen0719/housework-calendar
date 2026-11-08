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
};
