import prisma from '../utils/db.js';
import { ValidationError } from '../utils/errors.js';

type LineInput = {
  accountId: string;
  debit?: number;
  credit?: number;
  description?: string | null;
};

export class AccountingService {
  static async createJournalEntry(input: {
    storeId?: string | null;
    entryNumber?: number | null;
    description?: string | null;
    date?: Date;
    lines: LineInput[];
  }) {
    const lines = input.lines || [];
    if (!lines.length) throw new ValidationError('Journal entry must contain at least one line');

    const totalDebit = lines.reduce((s, l) => s + (Number(l.debit || 0)), 0);
    const totalCredit = lines.reduce((s, l) => s + (Number(l.credit || 0)), 0);

    if (Math.abs(totalDebit - totalCredit) > 1e-9) {
      throw new ValidationError('Journal entry not balanced: debits must equal credits');
    }

    return prisma.$transaction(async (tx: any) => {
      const je = await tx.journalEntry.create({
        data: {
          storeId: input.storeId || null,
          entryNumber: input.entryNumber || null,
          description: input.description || null,
          date: input.date || new Date(),
          totalDebit,
          totalCredit,
        }
      });

      for (const l of lines) {
        await tx.journalLine.create({
          data: {
            journalEntryId: je.id,
            accountId: l.accountId,
            debit: Number(l.debit || 0),
            credit: Number(l.credit || 0),
            description: l.description || null,
          }
        });
      }

      return je;
    });
  }
}

export default AccountingService;
