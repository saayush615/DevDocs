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

// Multer config(md & text for mvp)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (file.originalname.endsWith('.md') || file.originalname.endsWith('.txt')) cb(null, true);
    else cb(Errors.badRequest('Only .md and .txt files allowed'));
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
