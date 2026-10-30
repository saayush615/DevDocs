import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { Errors } from '../lib/errorFactory.js';
import { MAX_FILE_BYTES } from '../lib/quota.js';
import { uploadDocument, listDocuments } from '../controllers/documents.controller.js';
import { uploadBurstLimiter } from '../middleware/rateLimit.js';

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

// Multer config (md, txt, and pdf)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    if (name.endsWith('.md') || name.endsWith('.txt') || name.endsWith('.pdf')) cb(null, true);
    else cb(Errors.badRequest('Only .md, .txt, and .pdf files allowed'));
  },
});

// Routes
documentsRouter.post(
  '/upload',
  uploadBurstLimiter,
  upload.single('file'),
  asyncHandler(uploadDocument),
);
documentsRouter.get('/', asyncHandler(listDocuments));
