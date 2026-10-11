import { rateLimit } from 'express-rate-limit';
import type { Request, Response } from 'express';
import type { AuthRequest } from './requireAuth.js';

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const value = raw ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// WINDOW_MS: Time duration (in milliseconds) during which requests are counted by the rate limiter.
const AUTH_WINDOW_MS = readInt('RATE_AUTH_WINDOW_MS', 900_000);
const AUTH_MAX = readInt('RATE_AUTH_MAX', 20);
const CHAT_WINDOW_MS = readInt('RATE_CHAT_WINDOW_MS', 60_000);
const CHAT_MAX = readInt('RATE_CHAT_MAX', 20);
const UPLOAD_WINDOW_MS = readInt('RATE_UPLOAD_WINDOW_MS', 60_000);
const UPLOAD_MAX = readInt('RATE_UPLOAD_MAX', 10);

const skipProxyChecks = {
  // Enable validation for the X-Forwarded-For header (false means don't skip this check).
  xForwardedForHeader: false,
  // Enable validation for the IP address fallback (false means don't skip this check).
  keyGeneratorIpFallback: false,
} as const;

function burstHandler(message: string) {
  return (_req: Request, res: Response) => {
    res.status(429).json({ error: message });
  };
}

export const authBurstLimiter = rateLimit({
  windowMs: AUTH_WINDOW_MS,
  limit: AUTH_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  handler: burstHandler('Too many authentication attempts. Please wait and try again.'),
});

export const chatBurstLimiter = rateLimit({
  windowMs: CHAT_WINDOW_MS,
  limit: CHAT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  validate: skipProxyChecks,
  keyGenerator: (req) => (req as AuthRequest).userId,
  handler: burstHandler('Too many chat requests. Please wait a moment and try again.'),
});

export const uploadBurstLimiter = rateLimit({
  windowMs: UPLOAD_WINDOW_MS,
  limit: UPLOAD_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  validate: skipProxyChecks,
  keyGenerator: (req) => (req as AuthRequest).userId,
  handler: burstHandler('Too many upload requests. Please wait a moment and try again.'),
});
