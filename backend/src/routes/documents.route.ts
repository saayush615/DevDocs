import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { Errors } from '../lib/errorFactory.js';
import { uploadDocument, listDocuments } from '../controllers/documents.controller.js';

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

// Multer config(md & text for mvp)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.originalname.endsWith('.md') || file.originalname.endsWith('.txt')) cb(null, true);
    else cb(Errors.badRequest('Only .md and .txt files allowed'));
  },
});

// Routes
documentsRouter.post('/upload', upload.single('file'), asyncHandler(uploadDocument));
documentsRouter.get('/', asyncHandler(listDocuments));
