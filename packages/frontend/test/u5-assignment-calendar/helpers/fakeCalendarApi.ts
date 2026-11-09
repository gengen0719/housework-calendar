import { vi } from 'vitest';
import type {
  AssignmentView,
  CalendarChild,
  ChoreType,
  Duty,
  MonthCalendar,
} from '@housework/shared';
import {
  FAKE_CHILD_USER_ID_1,
  FAKE_CHILD_USER_ID_2,
  FAKE_CHORE_TYPE_ID_1,
  FAKE_CHORE_TYPE_ID_2,
  FAKE_SESSION_TOKEN,
} from '../../fixtures/fakeSecrets';

/** U5 の画面の筋書きで使う、カレンダーと割り当ての API の差し替え（状態を持つ） */

export interface RecordedCall {
  method: string;
  path: string;
  headers: Headers;
  body: unknown;
  signal: AbortSignal | undefined;
}

export interface FakeResponse {
  status: number;
  body?: unknown;
}

export const HANAKO = { userId: 'user-hanako', displayName: '花子' };
export const TARO = { userId: FAKE_CHILD_USER_ID_1, displayName: '太郎' };
export const JIRO = { userId: FAKE_CHILD_USER_ID_2, displayName: '次郎' };
export const DISHES_ID = FAKE_CHORE_TYPE_ID_1;
export const GARBAGE_ID = FAKE_CHORE_TYPE_ID_2;

const NOW = '2026-11-02T00:00:00.000Z';
const SESSION = { sessionToken: FAKE_SESSION_TOKEN, expiresAt: '2026-11-01T01:00:00.000Z' };
const FAMILY = { familyId: 'fam-1', name: '田中家' };

export const CHILDREN: CalendarChild[] = [TARO, JIRO];

export function choreType(
  over: Partial<ChoreType> & Pick<ChoreType, 'choreTypeId' | 'name'>,
): ChoreType {
  return { unitPrice: 100, active: true, createdAt: NOW, updatedAt: NOW, ...over };
}

interface FakeState {
  calls: RecordedCall[];
  /** 画面を開く人の役割 */
  role: 'admin' | 'child';
  /** 裏側の「今日」（日本時間） */
  today: string;
  choreTypes: ChoreType[];
  calendars: Record<string, MonthCalendar>;
  assignments: Record<string, AssignmentView>;
  /** 月ごとの GET カレンダーの応答を、開けるまで待たせる */
  gates: Record<string, Promise<void>>;
  /** true なら GET カレンダーは 500 */
  calendarFails: boolean;
  /** 保存（PUT）の答え。順に使い、尽きたら最後の答えを使う。空なら 200 */
  saveAnswers: FakeResponse[];
  /** 担当の変更（PATCH）の答え。空なら受けた担当を書き換えて 200 */
  patchAnswers: FakeResponse[];
  /** 記録（POST /record）の答え。順に使い、尽きたら最後の答えを使う。空なら受けた担当を「済」にして 200（U6） */
  recordAnswers: FakeResponse[];
}

export const fake: FakeState = {
  calls: [],
  role: 'admin',
  today: '2026-11-15',
  choreTypes: [],
  calendars: {},
  assignments: {},
  gates: {},
  calendarFails: false,
  saveAnswers: [],
  patchAnswers: [],
  recordAnswers: [],
};

export function resetFake(): void {
  fake.calls = [];
  fake.role = 'admin';
  fake.today = '2026-11-15';
  fake.choreTypes = [
    choreType({ choreTypeId: DISHES_ID, name: '皿洗い' }),
    choreType({ choreTypeId: GARBAGE_ID, name: 'ごみ出し' }),
  ];
  fake.calendars = {};
  fake.assignments = {};
  fake.gates = {};
  fake.calendarFails = false;
  fake.saveAnswers = [];
  fake.patchAnswers = [];
  fake.recordAnswers = [];
}

let dutySequence = 0;
const DUTY_ID_PREFIX = '44444444-4444-4444-8444-';

/** 担当を 1 件作る（名前は種類の一覧から引く） */
export function duty(
  over: Partial<Duty> & Pick<Duty, 'date' | 'choreTypeId' | 'childUserId'>,
): Duty {
  dutySequence += 1;
  const type = fake.choreTypes.find((c) => c.choreTypeId === over.choreTypeId);
  return {
    dutyId: `${DUTY_ID_PREFIX}${String(dutySequence).padStart(12, '0')}`,
    choreName: type?.name ?? '',
    status: 'todo',
    origin: 'rule',
    version: 1,
    recordedAt: null,
    recordedBy: null,
    recordedByName: null,
    unitPrice: null,
    ...over,
  };
}

/** 月のカレンダーを作る（種類と子供は、いまの状態から入れる） */
export function makeCalendar(month: string, over: Partial<MonthCalendar> = {}): MonthCalendar {
  return {
    month,
    confirmed: false,
    hasAssignment: true,
    today: fake.today,
    duties: [],
    children: CHILDREN,
    choreTypes: fake.choreTypes.map((c) => ({
      choreTypeId: c.choreTypeId,
      name: c.name,
      active: c.active,
    })),
    ...over,
  };
}

/** 月のカレンダーをその月の応答として置く */
export function setCalendar(month: string, over: Partial<MonthCalendar> = {}): MonthCalendar {
  const calendar = makeCalendar(month, over);
  fake.calendars[month] = calendar;
  return calendar;
}

function respond(status: number, body?: unknown): Response {
  return new Response(body === undefined || status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function nextAnswer(answers: FakeResponse[]): FakeResponse | undefined {
  return answers.length > 1 ? answers.shift() : answers[0];
}

const adminFamily = () => ({ ...FAMILY, role: fake.role });

export function installFakeApi(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
      fake.calls.push({
        method,
        path: input,
        headers: new Headers(init?.headers),
        body,
        signal: init?.signal ?? undefined,
      });
      if (method === 'POST' && input === '/v1/sessions') return respond(201, SESSION);
      if (method === 'GET' && input === '/v1/me') {
        const self = fake.role === 'admin' ? HANAKO : TARO;
        return respond(200, { ...self, family: adminFamily() });
      }
      if (method === 'GET' && input === '/v1/family/members') {
        return respond(200, [
          { ...HANAKO, role: 'admin' },
          ...CHILDREN.map((c) => ({ ...c, role: 'child' })),
        ]);
      }
      if (method === 'GET' && input === '/v1/family/invitation') return respond(200, null);
      if (method === 'GET' && input === '/v1/family/notification-group') return respond(200, null);
      if (method === 'GET' && input === '/v1/chore-types') {
        return respond(200, [
          ...fake.choreTypes.filter((c) => c.active),
          ...fake.choreTypes.filter((c) => !c.active),
        ]);
      }
      const calendarMatch = /^\/v1\/months\/(\d{4}-\d{2})\/calendar$/.exec(input);
      if (method === 'GET' && calendarMatch) {
        const month = calendarMatch[1] as string;
        const gate = fake.gates[month];
        if (gate) await gate;
        if (fake.calendarFails) return respond(500, { error: { reason: 'INTERNAL' } });
        return respond(200, fake.calendars[month] ?? makeCalendar(month, { hasAssignment: false }));
      }
      const assignmentMatch = /^\/v1\/months\/(\d{4}-\d{2})\/assignment$/.exec(input);
      if (assignmentMatch) {
        const month = assignmentMatch[1] as string;
        if (method === 'GET') {
          return respond(200, fake.assignments[month] ?? { month, rules: [], exists: false });
        }
        if (method === 'PUT') {
          const answer = nextAnswer(fake.saveAnswers);
          if (answer) return respond(answer.status, answer.body);
          return respond(200, makeCalendar(month));
        }
      }
      const recordMatch = /^\/v1\/duties\/(.+)\/record$/.exec(input);
      if (method === 'POST' && recordMatch) {
        const answer = nextAnswer(fake.recordAnswers);
        if (answer) return respond(answer.status, answer.body);
        const found = Object.values(fake.calendars)
          .flatMap((c) => c.duties)
          .find((d) => d.dutyId === recordMatch[1]);
        if (!found) return respond(404, { error: { reason: 'NOT_FOUND' } });
        const self = fake.role === 'admin' ? HANAKO : TARO;
        return respond(200, {
          ...found,
          status: 'done',
          recordedAt: '2026-11-15T07:42:00.000Z',
          recordedBy: self.userId,
          recordedByName: self.displayName,
          unitPrice: 100,
          version: found.version + 1,
        });
      }
      const dutyMatch = /^\/v1\/duties\/(.+)$/.exec(input);
      if (method === 'PATCH' && dutyMatch) {
        const answer = nextAnswer(fake.patchAnswers);
        if (answer) return respond(answer.status, answer.body);
        const found = Object.values(fake.calendars)
          .flatMap((c) => c.duties)
          .find((d) => d.dutyId === dutyMatch[1]);
        if (!found) return respond(404, { error: { reason: 'NOT_FOUND' } });
        const childUserId = (body as { childUserId: string }).childUserId;
        return respond(200, {
          ...found,
          childUserId,
          origin: 'manual',
          version: found.version + 1,
        });
      }
      return respond(404, {});
    }),
  );
}

export const callsTo = (method: string, path: string): RecordedCall[] =>
  fake.calls.filter((c) => c.method === method && c.path === path);
