import prisma from '../utils/db.js';

export class ExpenseService {
  /**
   * Create a new expense record.
   */
  static async createExpense(data: {
    storeId: string;
    amount: number;
    category: string;
    description?: string;
    documentUrl?: string;
    date?: string;
  }) {
    return prisma.expense.create({
      data: {
        storeId: data.storeId,
        amount: data.amount,
        category: data.category,
        description: data.description,
        documentUrl: data.documentUrl,
        date: data.date ? new Date(data.date) : new Date(),
      }
    });
  }

  /**
   * List expenses for a store.
   */
  static async listExpenses(storeId: string) {
    return prisma.expense.findMany({
      where: { storeId },
      orderBy: { date: 'desc' }
    });
  }

  /**
   * Delete an expense record.
   */
  static async deleteExpense(id: string, storeId: string) {
    return prisma.expense.delete({
      where: { id, storeId }
    });
  }
}

export default ExpenseService;
