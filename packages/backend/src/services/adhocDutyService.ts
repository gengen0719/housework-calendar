import { randomUUID } from 'node:crypto';
import { type Duty } from '@housework/shared';
import { ApiError } from '../lib/errors';
import type { FamilyContext } from '../middleware/requireMembership';
import * as repository from '../repositories/calendarRepository';
import * as chores from './choreTypeService';
import * as members from './familyMemberService';
import { getMonthCalendar } from './calendarService';
import { tables } from '../lib/dynamoClient';
import { typeSortKey } from '../repositories/choreTypeRepository';

/** 同日同種類を一意にし、月確定とマスタ・所属変更を同じ取引で検証する。 */
export async function create(
  ctx: FamilyContext,
  input: { date: string; choreTypeId: string; childUserId: string },
  today: string,
  now: Date,
): Promise<Duty> {
  const month = input.date.slice(0, 7);
  for (let attempt = 0; attempt < 2; attempt++) {
    const [type, child, items] = await Promise.all([
      chores.get(ctx, input.choreTypeId),
      members.findFamilyChild(ctx, input.childUserId),
      repository.loadMonth(ctx.familyId, month),
    ]);
    if (!type || !child.ok) throw new ApiError(404, 'NOT_FOUND');
    if (!type.active || type.purpose !== 'adhoc') throw new ApiError(422, 'CHORE_TYPE_INACTIVE');
    if (items.state?.confirmed) throw new ApiError(409, 'MONTH_CONFIRMED');
    if (items.duties.some((d) => d.date === input.date && d.choreTypeId === input.choreTypeId))
      throw new ApiError(409, 'DUTY_ALREADY_EXISTS');
    const dutyId = randomUUID();
    const at = now.toISOString();
    const record = {
      ...input,
      dutyId,
      familyId: ctx.familyId,
      month,
      status: 'todo' as const,
      origin: 'manual' as const,
      adhoc: true,
      version: 1,
      createdAt: at,
      updatedAt: at,
    };
    const result = await repository.writeTransaction([
      ...repository.buildCreateDutyItems(record),
      repository.buildMonthGuard(ctx.familyId, month),
      {
        ConditionCheck: {
          TableName: tables.choreTypes(),
          Key: { familyId: ctx.familyId, sk: typeSortKey(input.choreTypeId) },
          ConditionExpression: '#active = :true AND #purpose = :purpose',
          ExpressionAttributeNames: { '#active': 'active', '#purpose': 'purpose' },
          ExpressionAttributeValues: { ':true': true, ':purpose': 'adhoc' },
        },
      },
      {
        ConditionCheck: {
          TableName: tables.users(),
          Key: { userId: input.childUserId },
          ConditionExpression: '#family = :family AND #role = :role',
          ExpressionAttributeNames: { '#family': 'familyId', '#role': 'role' },
          ExpressionAttributeValues: { ':family': ctx.familyId, ':role': 'child' },
        },
      },
    ]);
    if (result === 'conflict') continue;
    const calendar = await getMonthCalendar(ctx, month, today);
    const duty = calendar.duties.find((d) => d.dutyId === dutyId);
    if (!duty) throw new ApiError(500, 'INTERNAL');
    return duty;
  }
  throw new ApiError(409, 'DUTY_CHANGED');
}
