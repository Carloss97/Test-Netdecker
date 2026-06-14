import prisma from '../utils/db.js';

export class AnalyticsService {
  /**
   * Get high-level sales and profit stats.
   */
  static async getSalesSummary(storeId?: string) {
    const orders = await prisma.order.findMany({
      where: {
        ...(storeId ? { storeId } : {}),
        status: { in: ['CONFIRMED', 'DELIVERED', 'SHIPPED'] },
      },
      include: {
        items: {
          include: {
            listing: true
          }
        }
      }
    });

    let totalRevenue = 0;
    let orderCount = orders.length;

    for (const order of orders) {
      totalRevenue += order.total;
    }

    // Get total expenses for the period/store
    const expenses = await prisma.expense.findMany({
      where: {
        ...(storeId ? { storeId } : {}),
      }
    });

    const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const grossProfit = totalRevenue - totalExpenses;

    return {
      totalRevenue,
      totalExpenses,
      grossProfit,
      orderCount,
      profitMargin: totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0,
    };
  }

  /**
   * Get revenue grouped by TCG.
   */
  static async getRevenueByTCG(storeId?: string) {
    const items = await prisma.orderItem.findMany({
      where: {
        order: {
          ...(storeId ? { storeId } : {}),
          status: { in: ['CONFIRMED', 'DELIVERED', 'SHIPPED'] },
        }
      },
      include: {
        listing: {
          include: {
            card: {
              include: { tcg: true }
            }
          }
        }
      }
    });

    const revenueMap: Record<string, number> = {};

    for (const item of items) {
      const tcgName = item.listing?.card?.tcg?.name || 'Unknown';
      revenueMap[tcgName] = (revenueMap[tcgName] || 0) + item.subtotal;
    }

    return Object.entries(revenueMap).map(([name, revenue]) => ({
      name,
      revenue
    })).sort((a, b) => b.revenue - a.revenue);
  }
}

export default AnalyticsService;
