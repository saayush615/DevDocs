// asyncHandler: wrap async controllers so you never write try/catch again.
// Without it, a thrown error inside async code hangs the request.
// Generic <T> keeps req.userId typed (works with AuthRequest).
import type { NextFunction, Request, Response } from 'express';

export function asyncHandler<T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as T, res, next)).catch(next);
  };
}