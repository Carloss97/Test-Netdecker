import express, { Request, Response } from 'express';
import AdminAuthService from '../services/AdminAuthService.js';
import requireApiKey from '../middleware/requireApiKey.js';
import requireAdmin from '../middleware/requireAdmin.js';

const router = express.Router();

router.post('/create', requireApiKey, async (req: Request, res: Response) => {
  const { email, password, role } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, error: { message: 'email and password required' } });

  const result = await AdminAuthService.createUser(String(email), String(password), (role === 'STAFF' ? 'STAFF' : 'ADMIN'));
  res.json({ success: true, data: result });
});

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, error: { message: 'email and password required' } });

  const result = await AdminAuthService.authenticate(String(email), String(password));
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
  } catch (_) {}
  res.json({ success: true });
});

router.get('/me', requireAdmin, async (req: Request, res: Response) => {
  const user = (req as any).adminUser;
  res.json({ success: true, data: user });
});

export default router;
