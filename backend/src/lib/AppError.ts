// AppError = our only error type. Carries an HTTP status + message.
// "Operational" = expected failure (400/404) -> send message to client.
// Non-operational (500) -> log it, send generic message instead.
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = statusCode < 500;
    Error.captureStackTrace(this, this.constructor);
  }
}
