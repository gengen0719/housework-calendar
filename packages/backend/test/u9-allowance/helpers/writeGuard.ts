/**
 * 書き込みの命令の見張り（NFR4.89）。偽の DynamoDB のモック（aws-sdk-client-mock）に、
 * PutItem・UpdateItem・DeleteItem・TransactWriteItems・BatchWriteItem が何回呼ばれたかを数えさせる。
 * U9 は読み取りだけなので、全部 0 回でなければならない。
 */
import {
  BatchWriteCommand,
  DeleteCommand,
  PutCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { installFakeDynamo } from '../../u1-skeleton-family/helpers/fakeDynamo';

type Fake = ReturnType<typeof installFakeDynamo>;

/** 書き込みの命令の呼び出し回数（命令の名前ごと）。 */
export function writeCalls(fake: Pick<Fake, 'mock'>): Record<string, number> {
  return {
    PutItem: fake.mock.commandCalls(PutCommand).length,
    UpdateItem: fake.mock.commandCalls(UpdateCommand).length,
    DeleteItem: fake.mock.commandCalls(DeleteCommand).length,
    TransactWriteItems: fake.mock.commandCalls(TransactWriteCommand).length,
    BatchWriteItem: fake.mock.commandCalls(BatchWriteCommand).length,
  };
}

/** 書き込みの命令の合計回数。 */
export const totalWrites = (fake: Pick<Fake, 'mock'>): number =>
  Object.values(writeCalls(fake)).reduce((sum, n) => sum + n, 0);
