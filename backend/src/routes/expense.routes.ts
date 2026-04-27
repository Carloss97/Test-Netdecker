import express, { Request, Response } from 'express';
import ExpenseService from '../services/ExpenseService.js';
import requireAdmin from '../middleware/requireAdmin.js';
import { UnauthorizedError } from '../utils/errors.js';

const router = express.Router();

router.use(requireAdmin);

function requireStore(req: Request): string {
  const id = req.store?.id;
  if (!id) throw new UnauthorizedError('Store not found');
  return id;
}

/**
 * POST /api/expenses
 */
router.post('/', async (req: Request, res: Response) => {
  const storeId = requireStore(req);
  const expense = await ExpenseService.createExpense({
    ...req.body,
    storeId
  });
  res.json({ success: true, expense });
});

/**
 * GET /api/expenses
 */
router.get('/', async (req: Request, res: Response) => {
  const storeId = requireStore(req);
  const expenses = await ExpenseService.listExpenses(storeId);
  res.json({ success: true, expenses });
});

/**
 * DELETE /api/expenses/:id
 */
router.delete('/:id', async (req: Request, res: Response) => {
  const storeId = requireStore(req);
  await ExpenseService.deleteExpense(req.params.id, storeId);
  res.json({ success: true });
});

export default router;
