import prisma from '../utils/db.js';
import { PriceService } from './PriceService.js';
import { PriceUpdateReason } from '@prisma/client';

type CreateApprovalInput = {
  listingId?: string;
  oldFinalPrice?: number | null;
  newFinalPrice: number;
  newReferencePrice: number;
  marginMultiplier: number;
  percentChange: number;
  requestedBy?: string;
  reason?: string;
  notes?: string;
};

export class PriceApprovalService {
  static async createApproval(input: CreateApprovalInput) {
    return prisma.priceChangeApproval.create({
      data: {
        listingId: input.listingId ?? null,
        oldFinalPrice: input.oldFinalPrice ?? null,
        newFinalPrice: input.newFinalPrice,
        newReferencePrice: input.newReferencePrice,
        marginMultiplier: input.marginMultiplier,
        percentChange: input.percentChange,
        requestedBy: input.requestedBy ?? null,
        notes: input.notes ?? null,
        // reason is stored in notes or via requestedBy; keep reason string field if needed later
      }
    });
  }

  static async listPending(limit = 50) {
    const rows = await prisma.priceChangeApproval.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: Math.min(Math.max(limit, 1), 200),
    });
    return rows;
  }

  static async approve(approvalId: string, processedBy?: string) {
    const approval = await prisma.priceChangeApproval.findUnique({ where: { id: approvalId } });
    if (!approval) throw new Error('Approval request not found');
    if (approval.status !== 'PENDING') throw new Error('Approval already processed');

    if (!approval.listingId) {
      throw new Error('Approval has no listingId');
    }

    // Apply the price update using PriceService
    await PriceService.updateListingPrice(
      approval.listingId,
      approval.newReferencePrice,
      approval.marginMultiplier,
      PriceUpdateReason.MANUAL_UPDATE,
      processedBy,
      `Approved automated sync change (approval ${approvalId})`,
    );

    const updated = await prisma.priceChangeApproval.update({
      where: { id: approvalId },
      data: {
        status: 'APPROVED',
        processedBy: processedBy ?? null,
        processedAt: new Date(),
      }
    });

    return updated;
  }

  static async reject(approvalId: string, processedBy?: string, notes?: string) {
    const approval = await prisma.priceChangeApproval.findUnique({ where: { id: approvalId } });
    if (!approval) throw new Error('Approval request not found');
    if (approval.status !== 'PENDING') throw new Error('Approval already processed');

    const updated = await prisma.priceChangeApproval.update({
      where: { id: approvalId },
      data: {
        status: 'REJECTED',
        processedBy: processedBy ?? null,
        processedAt: new Date(),
        notes: notes ?? approval.notes,
      }
    });

    return updated;
  }
}

export default PriceApprovalService;
