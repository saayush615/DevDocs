// Quota controller: returns today's usage + remaining limits so the UI
// sidebar can render a live "how much is left" meter.
import type { Response } from 'express';
import { prisma } from '../lib/prisma.js';
import type { AuthRequest } from '../middleware/requireAuth.js';
import {
  QUERY_DAILY_LIMIT,
  UPLOAD_DAILY_LIMIT,
  DOC_LIFETIME_LIMIT,
  CONV_LIFETIME_LIMIT,
  todayUtc,
} from '../lib/quota.js';

// GET /api/quota
export async function getQuota(req: AuthRequest, res: Response) {
  const date = todayUtc(); // midnight-UTC today — same day boundary as the meters

  // 3 reads in parallel: today's row + the two lifetime counts.
  const [usage, docCount, convCount] = await Promise.all([
    prisma.usageDaily.findUnique({
      where: { userId_date: { userId: req.userId, date } },
    }),
    prisma.document.count({ where: { userId: req.userId } }),
    prisma.conversation.count({ where: { userId: req.userId } }),
  ]);

  // Limits come from quota.ts (env-driven with defaults). "left" is derived
  // client-side as limit - used, so the UI never hardcodes numbers.
  res.status(200).json({
    success: true,
    message: 'Quota fetched',
    data: {
      queries: { used: usage?.queryCount ?? 0, limit: QUERY_DAILY_LIMIT },
      uploads: { used: usage?.uploadCount ?? 0, limit: UPLOAD_DAILY_LIMIT },
      documents: { used: docCount, limit: DOC_LIFETIME_LIMIT },
      conversations: { used: convCount, limit: CONV_LIFETIME_LIMIT },
    },
  });
}