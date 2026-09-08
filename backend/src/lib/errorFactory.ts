// ErrorFactory: one helper per case. Controllers just throw these.
import { AppError } from './AppError.js';

export const Errors = {
  badRequest: (msg = 'Bad request') => 
    new AppError(msg, 400),

  unauthorized: (msg = 'Unauthorized') => 
    new AppError(msg, 401),

  forbidden: (msg = 'Forbidden') => 
    new AppError(msg, 403),

  notFound: (msg = 'Not found') => 
    new AppError(msg, 404),

  aiService: (msg = 'AI service failed') => 
    new AppError(msg, 502),

  internal: (msg = 'Something went wrong') => 
    new AppError(msg, 500),
};