import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../utils/errors.js';

export default function requireApiKey(req: Request, _res: Response, next: NextFunction) {
  const expected = process.env.IMPORT_API_KEY;
  // If no IMPORT_API_KEY configured, allow requests (useful for local/dev)
  if (!expected) return next();

  const key = String(req.headers['x-api-key'] || '');
  if (!key || key !== expected) {
    throw new UnauthorizedError('Missing or invalid API key');
  }

  return next();
}
