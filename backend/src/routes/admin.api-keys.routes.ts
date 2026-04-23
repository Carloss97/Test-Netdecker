import express, { Request, Response } from 'express';
import { ValidationError } from '../utils/errors.js';
import ApiKeyService from '../services/ApiKeyService.js';
import requirePermission from '../middleware/requirePermission.js';

const router = express.Router();

router.post('/:id/rotate', requirePermission('rotate', 'api-key'), async (req: Request, res: Response) => {
  const apiKeyId = String(req.params.id || '').trim();
  if (!apiKeyId) {
    throw new ValidationError('API key id is required');
  }

  const admin = (req as any).adminUser as { id: string } | undefined;
  const rotated = await ApiKeyService.rotateApiKeyById(apiKeyId, {
    rotatedBy: admin?.id || null,
    reason: 'manual-rotation',
  });

  res.json({
    success: true,
    apiKey: rotated.apiKey,
    apiKeyId: rotated.id,
    keyType: rotated.keyType,
    name: rotated.name,
  });
});

router.get('/', requirePermission('view', 'api-key'), async (_req: Request, res: Response) => {
  const apiKeys = await ApiKeyService.listApiKeys();
  res.json({ success: true, apiKeys });
});

export default router;