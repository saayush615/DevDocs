import { z } from 'zod';

export const chatBodySchema = z.object({
  question: z.string().min(1).max(2000),
  conversationId: z.string().optional(),
});

export const conversationTitleSchema = z.object({
  title: z.string().trim().min(1).max(100),
});

export const conversationBodySchema = z.object({
  title: z.string().trim().min(1).max(100).optional(),
});
