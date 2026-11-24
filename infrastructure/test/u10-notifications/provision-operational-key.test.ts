import type { CloudFormationCustomResourceEvent } from 'aws-lambda';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handler } from '../../lib/handlers/provision-operational-key';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('@aws-sdk/client-ssm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@aws-sdk/client-ssm')>()),
  SSMClient: class {
    send = send;
  },
}));

const parameterName = '/housework-calendar/staging/notifications/operational-hash-key';
const event = {
  RequestType: 'Create',
  ResponseURL: 'https://example.invalid/response',
  StackId: 'stack',
  RequestId: 'request',
  LogicalResourceId: 'OperationalKey',
  ResourceType: 'Custom::NotificationOperationalKey',
  ServiceToken: 'service',
  ResourceProperties: { ServiceToken: 'service' },
} satisfies CloudFormationCustomResourceEvent;
const callback = vi.fn<typeof fetch>();

beforeEach(() => {
  send.mockReset().mockResolvedValue({});
  callback.mockReset().mockResolvedValue(new Response());
  vi.stubEnv('OPERATIONAL_KEY_PARAMETER', parameterName);
  vi.stubGlobal('fetch', callback);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function result() {
  return JSON.parse(callback.mock.calls[0]![1]!.body as string);
}

describe('通知の運用鍵の配備', () => {
  it('乱数をSecureStringとして保存し、CloudFormationの応答には含めない', async () => {
    await handler(event);
    const { input } = send.mock.calls[0]![0];
    expect(input).toEqual({
      Name: parameterName,
      Type: 'SecureString',
      Value: expect.stringMatching(/^[0-9a-f]{64}$/),
      Overwrite: false,
    });
    expect(result()).toMatchObject({ Status: 'SUCCESS', PhysicalResourceId: parameterName });
    expect(callback.mock.calls[0]![1]!.body).not.toContain(input.Value);
  });

  it('作成の再試行で鍵を上書きしない', async () => {
    send.mockRejectedValueOnce(Object.assign(new Error(), { name: 'ParameterAlreadyExists' }));
    await handler(event);
    expect(result()).toMatchObject({ Status: 'SUCCESS' });
  });

  it('削除時は鍵を保持する', async () => {
    await handler({ ...event, RequestType: 'Delete', PhysicalResourceId: parameterName });
    expect(send).not.toHaveBeenCalled();
    expect(result()).toMatchObject({ Status: 'SUCCESS', PhysicalResourceId: parameterName });
  });

  it('保存に失敗したらCloudFormationに失敗を返す', async () => {
    send.mockRejectedValueOnce(new Error('Unexpected error'));
    await handler(event);
    expect(result()).toMatchObject({ Status: 'FAILED' });
    expect(callback.mock.calls[0]![1]!.body).not.toContain('Unexpected error');
  });
});
