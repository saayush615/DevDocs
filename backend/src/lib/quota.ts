// V0 quotas & caps — the single place that reads quota env vars and enforces limits.
// Controllers just call assert*() before starting work and recordUsage() after success.
import { prisma } from './prisma.js';
import { Errors } from './ErrorFactory.js';

export type DailyKind = 'query' | 'upload';
export type LifetimeKind = 'document' | 'conversation';

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// Limits (exported so routes/UI can reference the same numbers).
export const QUERY_DAILY_LIMIT = readInt('QUOTA_MAX_QUERIES_PER_DAY', 30);
export const UPLOAD_DAILY_LIMIT = readInt('QUOTA_MAX_UPLOADS_PER_DAY', 20);
export const DOC_LIFETIME_LIMIT = readInt('QUOTA_MAX_DOCUMENTS', 20);
export const CONV_LIFETIME_LIMIT = readInt('QUOTA_MAX_CONVERSATIONS', 50);
export const MAX_FILE_MB = readInt('QUOTA_MAX_FILE_MB', 5);
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

export function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Throws 429 if the user has already hit today's allowance.
export async function assertDailyQuota(userId: string, kind: DailyKind): Promise<void> {
  const row = await prisma.usageDaily.findUnique({
    where: { userId_date: { userId, date: todayUtc() } },
  });
  if (kind === 'query') {
    if ((row?.queryCount ?? 0) >= QUERY_DAILY_LIMIT) {
      throw Errors.tooManyRequests(
        `Daily query limit reached (${QUERY_DAILY_LIMIT}/day). Try again tomorrow.`,
      );
    }
  } else if ((row?.uploadCount ?? 0) >= UPLOAD_DAILY_LIMIT) {
    throw Errors.tooManyRequests(
      `Daily upload limit reached (${UPLOAD_DAILY_LIMIT}/day). Try again tomorrow.`,
    );
  }
}

// Adds 1 to today's counter.
export async function recordUsage(userId: string, kind: DailyKind): Promise<void> {
  const date = todayUtc();
  if (kind === 'query') {
    await prisma.usageDaily.upsert({
        where: {userId_date: { userId, date}},
        update: { queryCount: { increment: 1 }},
        create: { userId, date, queryCount: 1},
    })
  } else {
    await prisma.usageDaily.upsert({
      where: { userId_date: { userId, date } },
      update: { uploadCount: { increment: 1 } },
      create: { userId, date, uploadCount: 1 },
    });
  }
}

// Throws 429 if the user's row count is already at the lifetime cap.
// "Strictly below" — i.e. 20 docs means the 21st create is blocked.
export async function assertLifetimeCap(userId: string, kind: LifetimeKind): Promise<void> {
  if (kind === 'document') {
    const count = await prisma.document.count({ where: { userId } });
    if (count >= DOC_LIFETIME_LIMIT) {
      throw Errors.tooManyRequests(
        `Document limit reached (${DOC_LIFETIME_LIMIT} max). Delete old documents to upload more.`,
      );
    }
  } else {
    const count = await prisma.conversation.count({ where: { userId } });
    if (count >= CONV_LIFETIME_LIMIT) {
      throw Errors.tooManyRequests(
        `Conversation limit reached (${CONV_LIFETIME_LIMIT} max). Delete old chats to start a new one.`,
      );
    }
  }
}
