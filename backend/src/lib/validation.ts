import { z } from 'zod';

export const chatBodySchema = z.object({
  question: z.string().min(1).max(2000),
  conversationId: z.string().optional(),
});

export const conversationBodySchema = z.object({
  title: z.string().min(1).max(100).optional(),
});