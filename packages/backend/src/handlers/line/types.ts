import { z } from 'zod';

/**
 * LINE の Webhook のイベントのうち、受け口が読む項目だけ。
 * message.text と postback.data の長さは、ここでは制限しない。1 件が長いだけで本文全体が 400 になるのを避け、
 * 長さは parseGroupCommand で確かめる（NFR4.28）。
 */
export const LineEventSchema = z.object({
  type: z.string(),
  webhookEventId: z.string().optional(),
  replyToken: z.string().optional(),
  timestamp: z.number().optional(),
  source: z
    .object({
      type: z.string().optional(),
      userId: z.string().optional(),
      groupId: z.string().optional(),
      roomId: z.string().optional(),
    })
    .optional(),
  message: z
    .object({
      type: z.string().optional(),
      text: z.string().optional(),
    })
    .optional(),
  postback: z
    .object({
      data: z.string().optional(),
    })
    .optional(),
});

export const WebhookBodySchema = z.object({
  events: z.array(LineEventSchema),
});

export type LineEvent = z.infer<typeof LineEventSchema>;
