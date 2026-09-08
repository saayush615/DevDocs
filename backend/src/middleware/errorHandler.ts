// Global error handling: 404 catcher + final error responder.
// Controllers throw -> asyncHandler forwards via next(err) -> lands here.
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { AppError } from '../lib/AppError.js';

// Runs when no route matched (wrong URL).
export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(new AppError('Route not found', 404));
}

// Final handler: 4 args = Express treats it as error middleware.
// Operational errors (AppError 4xx) -> send message. Else -> log + generic 500.
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // Multer (file upload) errors have no status — convert to 400 here.
  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
}