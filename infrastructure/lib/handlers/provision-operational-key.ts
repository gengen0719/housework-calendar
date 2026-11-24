import { randomBytes } from 'node:crypto';
import { PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import type { CloudFormationCustomResourceEvent } from 'aws-lambda';

const ssm = new SSMClient({ maxAttempts: 2 });

export async function handler(event: CloudFormationCustomResourceEvent): Promise<void> {
  const parameterName = process.env.OPERATIONAL_KEY_PARAMETER!;
  let status = 'SUCCESS';
  let reason = 'Operational key is ready';
  if (event.RequestType !== 'Delete') {
    try {
      await ssm.send(
        new PutParameterCommand({
          Name: parameterName,
          Type: 'SecureString',
          Value: randomBytes(32).toString('hex'),
          Overwrite: false,
        }),
        { abortSignal: AbortSignal.timeout(10_000) },
      );
    } catch (error) {
      // CloudFormation can retry the request after the initial write has succeeded.
      if (!(error instanceof Error) || error.name !== 'ParameterAlreadyExists') {
        status = 'FAILED';
        reason = 'Could not create the operational key in Parameter Store';
      }
    }
  }

  const response = await fetch(event.ResponseURL, {
    method: 'PUT',
    headers: { 'content-type': '' },
    body: JSON.stringify({
      Status: status,
      Reason: reason,
      PhysicalResourceId: event.RequestType === 'Create' ? parameterName : event.PhysicalResourceId,
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
    }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error('Could not report operational key provisioning result');
}
