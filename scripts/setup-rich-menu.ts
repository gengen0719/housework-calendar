#!/usr/bin/env node
/**
 * LINE のリッチメニュー（画面の下の「やった」ボタン）を設定・確認・取り消しするスクリプト（U6）。
 *
 * 使い方（リポジトリのルートで）:
 *   npx tsx scripts/setup-rich-menu.ts --env staging set      # メニューを作って全員に適用する
 *   npx tsx scripts/setup-rich-menu.ts --env staging get      # 今の設定を確認する
 *   npx tsx scripts/setup-rich-menu.ts --env staging delete   # 設定を取り消す
 *
 * 決まり（NFR10.6、本番のデータの決まり）:
 *   - `--env staging|production` は必須。既定で本番を選ばない（指定がなければ止める）。
 *   - チャネルアクセストークンは、環境ごとのパラメータストア
 *     （`/housework-calendar/<env>/line/channel-access-token`）から実行時に読む。
 *     トークンの値は、このスクリプトにも README にも書かない（例は `<作り物の値>`）。
 *   - LINE の公式の API は、SDK を足さず fetch で直接呼ぶ。
 *   - Calendar にも ChoreTypes にも触れない（記録のデータは一切読み書きしない）。
 */
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

type Env = 'staging' | 'production';
type Action = 'set' | 'get' | 'delete';

const LINE_API = 'https://api.line.me';

/** リッチメニューの定義（「やった」のボタン 1 つ。押すと postback `action=record.list`） */
const RICH_MENU = {
  size: { width: 2500, height: 843 },
  selected: true,
  name: 'housework-record',
  chatBarText: 'やった',
  areas: [
    {
      bounds: { x: 0, y: 0, width: 2500, height: 843 },
      action: { type: 'postback', data: 'action=record.list', displayText: 'やった' },
    },
  ],
} as const;

interface CliArgs {
  env: Env;
  action: Action;
}

/** 引数を読む。`--env` が staging / production のどちらかで、動作が set / get / delete のときだけ通す。 */
export function parseArgs(argv: string[]): CliArgs {
  let env: string | undefined;
  let action: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--env') {
      env = argv[i + 1];
      i += 1;
    } else if (arg === 'set' || arg === 'get' || arg === 'delete') {
      action = arg;
    } else {
      throw new Error(`知らない引数です: ${arg}`);
    }
  }
  if (env !== 'staging' && env !== 'production') {
    throw new Error('--env staging または --env production を指定してください（必須）');
  }
  if (action !== 'set' && action !== 'get' && action !== 'delete') {
    throw new Error('動作（set / get / delete）を指定してください');
  }
  return { env, action };
}

/** パラメータストアからチャネルアクセストークンを実行時に読む（値はログに出さない）。 */
async function readAccessToken(env: Env): Promise<string> {
  const name = `/housework-calendar/${env}/line/channel-access-token`;
  const client = new SSMClient({});
  const response = await client.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  const value = response.Parameter?.Value;
  if (!value) throw new Error(`パラメータストアに値がありません: ${name}`);
  return value;
}

/** LINE の API を fetch で呼ぶ。失敗したら本文を添えて投げる（トークンは出さない）。 */
async function lineFetch(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const response = await fetch(`${LINE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`LINE の API が ${response.status} を返しました: ${method} ${path} ${text}`);
  }
  return response;
}

/** 今適用されているリッチメニューの ID（なければ null）。 */
async function getDefaultRichMenuId(token: string): Promise<string | null> {
  const response = await fetch(`${LINE_API}/v2/bot/user/all/richmenu`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`既定のリッチメニューの取得に失敗しました: ${response.status} ${text}`);
  }
  const json = (await response.json()) as { richMenuId?: string };
  return json.richMenuId ?? null;
}

/** 登録されているリッチメニューの一覧（ID と名前）。 */
async function listRichMenus(token: string): Promise<Array<{ richMenuId: string; name: string }>> {
  const response = await lineFetch(token, 'GET', '/v2/bot/richmenu/list');
  const json = (await response.json()) as {
    richmenus?: Array<{ richMenuId: string; name: string }>;
  };
  return json.richmenus ?? [];
}

/** set: 既存の同名メニューを消してから、新しく作って全員に適用する。 */
async function setRichMenu(token: string): Promise<void> {
  for (const menu of await listRichMenus(token)) {
    if (menu.name === RICH_MENU.name) {
      await lineFetch(token, 'DELETE', `/v2/bot/richmenu/${menu.richMenuId}`);
      console.log(`古いメニューを消しました: ${menu.richMenuId}`);
    }
  }
  const created = await lineFetch(token, 'POST', '/v2/bot/richmenu', RICH_MENU);
  const { richMenuId } = (await created.json()) as { richMenuId: string };
  console.log(`メニューを作りました: ${richMenuId}`);
  console.warn(
    'このメニューには画像がまだありません。LINE Developers のコンソール、または ' +
      `POST /v2/bot/richmenu/${richMenuId}/content で画像を登録してください。`,
  );
  await lineFetch(token, 'POST', `/v2/bot/user/all/richmenu/${richMenuId}`);
  console.log('全員に適用しました。');
}

/** get: 今適用されているメニューと、登録されている一覧を表示する。 */
async function getRichMenu(token: string): Promise<void> {
  const current = await getDefaultRichMenuId(token);
  console.log(`今適用されているメニュー: ${current ?? '(なし)'}`);
  const menus = await listRichMenus(token);
  if (menus.length === 0) {
    console.log('登録されているメニューはありません。');
    return;
  }
  for (const menu of menus) {
    console.log(`  - ${menu.richMenuId} (${menu.name})`);
  }
}

/** delete: 全員への適用を外し、このスクリプトが作った名前のメニューを消す。 */
async function deleteRichMenu(token: string): Promise<void> {
  const current = await getDefaultRichMenuId(token);
  if (current) {
    await lineFetch(token, 'DELETE', '/v2/bot/user/all/richmenu');
    console.log('全員への適用を外しました。');
  }
  let removed = 0;
  for (const menu of await listRichMenus(token)) {
    if (menu.name === RICH_MENU.name) {
      await lineFetch(token, 'DELETE', `/v2/bot/richmenu/${menu.richMenuId}`);
      removed += 1;
    }
  }
  console.log(`メニューを ${removed} 件消しました。`);
}

export async function run(args: CliArgs): Promise<void> {
  const token = await readAccessToken(args.env);
  if (args.action === 'set') await setRichMenu(token);
  else if (args.action === 'get') await getRichMenu(token);
  else await deleteRichMenu(token);
}

// スクリプトとして直接実行されたときだけ動かす（テストから import しても動かない）。
const invokedPath = process.argv[1] ?? '';
if (import.meta.url === `file://${invokedPath}` || invokedPath.endsWith('setup-rich-menu.ts')) {
  const args = parseArgs(process.argv.slice(2));
  run(args).catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
