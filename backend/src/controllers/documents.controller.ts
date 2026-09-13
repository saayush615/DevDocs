import type { Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { Errors } from '../lib/errorFactory.js';
import type { AuthRequest } from '../middleware/requireAuth.js';
import { ingestUploadedFile } from '../services/upload.service.js';

// POST /upload — multer puts the file on req.file.
export async function uploadDocument(req: AuthRequest, res: Response) {
  if (!req.file) throw Errors.badRequest('No file uploaded');
  const done = await ingestUploadedFile(req.userId, req.file.originalname, req.file.buffer);
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
