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
  res.json({ success: true, data: result });
});

router.post('/logout', requireAdmin, async (req: Request, res: Response) => {
  const token = String(req.headers['authorization'] || '').replace(/^Bearer\s*/i, '') || String(req.headers['x-admin-token'] || '');
  await AdminAuthService.logout(token);
  res.json({ success: true });
});

router.get('/me', requireAdmin, async (req: Request, res: Response) => {
  const user = (req as any).adminUser;
  res.json({ success: true, data: user });
});

export default router;
