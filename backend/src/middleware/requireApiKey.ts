import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from '../utils/errors.js';
import ApiKeyService from '../services/ApiKeyService.js';

export default async function requireApiKey(req: Request, _res: Response, next: NextFunction) {
  try {
    const seeded = await ApiKeyService.ensureSeededKey('IMPORT');
    if (!seeded && !process.env.IMPORT_API_KEY) {
      return next();
    }

    const key = String(req.headers['x-api-key'] || '').trim();
    if (!key) {
      throw new UnauthorizedError('Missing or invalid API key');
    }

    const valid = await ApiKeyService.verifyProvidedKey('IMPORT', key);
    if (!valid) {
      throw new UnauthorizedError('Missing or invalid API key');
    }

    return next();
  } catch (error) {
    if (!process.env.IMPORT_API_KEY) {
      return next();
    }
    throw error;
  }
}
