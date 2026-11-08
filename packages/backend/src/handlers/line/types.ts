import { z } from 'zod';

/** LINE の Webhook のイベントのうち、受け口が読む項目だけ。 */
export const LineEventSchema = z.object({
  type: z.string(),
  webhookEventId: z.string().optional(),
  replyToken: z.string().optional(),
  source: z
    .object({
      type: z.string().optional(),
      userId: z.string().optional(),
    })
    .optional(),
});

export const WebhookBodySchema = z.object({
  events: z.array(LineEventSchema),
});

export type LineEvent = z.infer<typeof LineEventSchema>;
