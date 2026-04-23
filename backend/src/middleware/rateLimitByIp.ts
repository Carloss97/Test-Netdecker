import type { NextFunction, Request, Response } from 'express';
import { TooManyRequestsError } from '../utils/errors.js';
import { RateLimitService } from '../services/RateLimitService.js';

function extractClientIp(req: Request): string {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return String(forwardedFor[0]).split(',')[0].trim();
  }

  return (req.ip || req.socket?.remoteAddress || '0.0.0.0').trim();
}

function getEndpointKey(req: Request): string {
  const mountedPath = `${req.baseUrl || ''}${req.path || req.url || ''}`.split('?')[0];
  return `${req.method.toUpperCase()}:${mountedPath || req.path || req.url || '/'}`;
}

export function rateLimitByIp(limit: number = 100, windowMs: number = 60000) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = extractClientIp(req);
    const endpoint = getEndpointKey(req);
    const key = `rate-limit:${ip}:${endpoint}`;

    const result = await RateLimitService.checkLimit(key, limit, windowMs);

    res.setHeader('X-RateLimit-Limit', String(limit));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetAt.getTime() / 1000)));

    if (!result.allowed) {
      throw new TooManyRequestsError('Rate limit exceeded');
    }

    return next();
  };
}

export default rateLimitByIp;