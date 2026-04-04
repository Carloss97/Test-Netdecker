// backend/src/utils/errors.ts

export class ApplicationError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}

export class NotFoundError extends ApplicationError {
  constructor(message: string) {
    super(404, message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends ApplicationError {
  constructor(message: string) {
    super(400, message);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends ApplicationError {
  constructor(message: string) {
    super(409, message);
    this.name = 'ConflictError';
  }
}

export class UnauthorizedError extends ApplicationError {
  constructor(message: string = 'Unauthorized') {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends ApplicationError {
  constructor(message: string = 'Forbidden') {
    super(403, message);
    this.name = 'ForbiddenError';
  }
}
