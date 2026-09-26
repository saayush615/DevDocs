import type { Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { Errors } from '../lib/ErrorFactory.js';
import type { AuthRequest } from '../middleware/requireAuth.js';
import { ingestUploadedFile } from '../services/upload.service.js';
import { assertDailyQuota, assertLifetimeCap, recordUsage } from '../lib/quota.js';

// POST /upload — multer puts the file on req.file.
export async function uploadDocument(req: AuthRequest, res: Response) {
  if (!req.file) throw Errors.badRequest('No file uploaded');

  await assertLifetimeCap(req.userId, 'document');
  await assertDailyQuota(req.userId, 'upload');

  const done = await ingestUploadedFile(req.userId, req.file.originalname, req.file.buffer);

  // Count the upload only after a successful embed (a failed embed doesn't
  // burn today's allowance). Errors here are non-fatal — the request already succeeded.
  await recordUsage(req.userId, 'upload').catch(() => {});

  res.status(200).json({
    success: true,
    message: 'Document embedded',
    data: done,
  });
}

// GET / — list mine, newest first.
export async function listDocuments(req: AuthRequest, res: Response) {
  const docs = await prisma.document.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
  });
  res.status(200).json({
    success: true,
    message: 'Document fetched',
    data: docs,
  });
}
