import type { Response } from 'express';
import type { AuthRequest } from '../middleware/requireAuth.js';
import { Errors } from '../lib/errorFactory.js';
import { transcribeAudio } from '../services/aiClient.service.js';

export async function transcribeVoice(req: AuthRequest, res: Response) {
  if (!req.file) throw Errors.badRequest('No audio uploaded');

  let text: string;
  try {
    text = await transcribeAudio(req.file.buffer, req.file.mimetype, req.file.originalname);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'No speech detected') throw Errors.badRequest(message);
    throw Errors.aiService('Transcription failed');
  }

  const trimmed = text.trim();
  if (!trimmed) throw Errors.badRequest('No speech detected');

  res.status(200).json({
    success: true,
    message: 'Transcribed',
    data: { text: trimmed },
  });
}
