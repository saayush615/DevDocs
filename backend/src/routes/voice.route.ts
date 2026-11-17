import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { Errors } from '../lib/errorFactory.js';
import { voiceBurstLimiter } from '../middleware/rateLimit.js';
import { transcribeVoice } from '../controllers/voice.controller.js';

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

const ALLOWED_AUDIO = new Set([
  'audio/webm',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/mp4',
  'audio/x-m4a',
]);

export const voiceRouter = Router();
voiceRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_BYTES },
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype.split(';')[0]?.trim().toLowerCase() ?? '';
    if (ALLOWED_AUDIO.has(mime)) cb(null, true);
    else cb(Errors.badRequest('Only webm, wav, mpeg, ogg, and mp4 audio are allowed'));
  },
});

function audioUpload(req: Request, res: Response, next: NextFunction) {
  upload.single('audio')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      next(Errors.badRequest('Audio exceeds the 8 MB limit'));
      return;
    }
    next(err);
  });
}

voiceRouter.post('/transcribe', voiceBurstLimiter, audioUpload, asyncHandler(transcribeVoice));
