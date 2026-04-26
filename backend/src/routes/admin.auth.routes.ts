import express, { Request, Response } from 'express';
import AdminAuthService from '../services/AdminAuthService.js';
import requireApiKey from '../middleware/requireApiKey.js';
import requireAdmin from '../middleware/requireAdmin.js';
import tenantResolver from '../middleware/tenantResolver.js';
import { rateLimitByIp } from '../middleware/rateLimitByIp.js';

const router = express.Router();

router.post('/create', requireApiKey, async (req: Request, res: Response) => {
  const { email, password, role } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, error: { message: 'email and password required' } });

  const normalizedRole = role === 'STAFF' || role === 'MANAGER' ? role : 'ADMIN';
  const result = await AdminAuthService.createUser(String(email), String(password), normalizedRole);
  res.json({ success: true, data: result });
});

router.post('/login', rateLimitByIp(5, 60000), async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, error: { message: 'email and password required' } });

  const storeId = req.body?.storeId ? String(req.body.storeId) : undefined;
  const result = await AdminAuthService.authenticate(String(email), String(password), storeId);
  // Set httpOnly cookie with session token. For cross-origin XHR/fetch the
  // cookie must be `SameSite=None` and `Secure`; in development we keep
  // `lax` to avoid Secure requirement on localhost.
  try {
    const expiresAt = result.expiresAt ? new Date(result.expiresAt).getTime() : null;
    const maxAge = expiresAt ? Math.max(0, expiresAt - Date.now()) : undefined;
    const isProd = process.env.NODE_ENV === 'production';
    const cookieOptions: any = {
      httpOnly: true,
      secure: isProd === true,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: typeof maxAge === 'number' ? maxAge : undefined,
      path: '/',
    };
    res.cookie('auth_token', result.token, cookieOptions);
    // Keep a JS-readable copy for browsers that block or clear localStorage.
    res.cookie('auth_token_js', result.token, {
      ...cookieOptions,
      httpOnly: false,
    });
  } catch (e) {
    // Non-fatal: continue returning token in body so clients without cookie support still work.
    console.warn('Failed to set auth cookie', e?.message || e);
  }

  res.json({ success: true, data: result });
});

router.post('/logout', requireAdmin, async (req: Request, res: Response) => {
  const token = String(req.headers['authorization'] || '').replace(/^Bearer\s*/i, '') || String(req.headers['x-admin-token'] || '');
  await AdminAuthService.logout(token);
  // Clear cookie if present (match sameSite/secure used when setting)
  try {
    const isProd = process.env.NODE_ENV === 'production';
    res.clearCookie('auth_token', { path: '/', sameSite: isProd ? 'none' : 'lax', secure: isProd });
    res.clearCookie('auth_token_js', { path: '/', sameSite: isProd ? 'none' : 'lax', secure: isProd });
  } catch (_) {}
  res.json({ success: true });
});

router.get('/me', requireAdmin, tenantResolver, async (req: Request, res: Response) => {
  const user = (req as any).adminUser as {
    id: string;
    email: string;
    role: 'ADMIN' | 'MANAGER' | 'STAFF' | string;
    storeId?: string | null;
  } | undefined;

  const sessionStoreId = typeof user?.storeId === 'string' ? user.storeId.trim() : '';
  const resolvedStoreId = typeof (req as any).store?.id === 'string' ? String((req as any).store.id).trim() : '';
  const isGlobalAdmin = user?.role === 'ADMIN' && !sessionStoreId;

  res.json({
    success: true,
    data: {
      ...(user || {}),
      storeId: sessionStoreId || null,
      resolvedStoreId: resolvedStoreId || null,
      scopeMode: sessionStoreId
        ? 'session-store-scoped'
        : resolvedStoreId
          ? 'request-store-scoped'
          : isGlobalAdmin
            ? 'global-admin'
            : 'unscoped',
    },
  });
});

export default router;
