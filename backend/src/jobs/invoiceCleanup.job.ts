import cron from 'node-cron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import prisma from '../utils/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function cleanupOldInvoices() {
  const retentionDays = Number(process.env.INVOICE_RETENTION_DAYS ?? '365');
  const storageDir = process.env.INVOICE_STORAGE_DIR
    ? path.resolve(process.env.INVOICE_STORAGE_DIR)
    : path.resolve(__dirname, '../../public/invoices');

  try {
    const files = await fs.readdir(storageDir);
    let deleted = 0;

    for (const file of files) {
      if (!file.toLowerCase().endsWith('.pdf')) continue;
      const fullPath = path.join(storageDir, file);
      const stat = await fs.stat(fullPath);
      const ageDays = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60 * 24);
      if (ageDays > retentionDays) {
        await fs.unlink(fullPath);
        deleted++;

        const base = file.slice(0, -4);
        // Try to find invoice by invoiceNumber then by id
        let invoice = await prisma.invoice.findFirst({ where: { invoiceNumber: base } });
        if (!invoice) invoice = await prisma.invoice.findUnique({ where: { id: base } });
        if (invoice && invoice.pdfUrl) {
          try {
            await prisma.invoice.update({ where: { id: invoice.id }, data: { pdfUrl: null } });
          } catch (e) {
            console.error('Failed to clear pdfUrl for invoice', invoice.id, e);
          }
        }
      }
    }

    console.log(`[InvoiceCleanup] Deleted ${deleted} files older than ${retentionDays} days from ${storageDir}`);
    return { deleted, storageDir, retentionDays };
  } catch (err: any) {
    if (err && (err as any).code === 'ENOENT') {
      console.log(`[InvoiceCleanup] Storage dir not found: ${storageDir}`);
      return { deleted: 0, storageDir, retentionDays };
    }
    console.error('[InvoiceCleanup] Error during cleanup', err);
    throw err;
  }
}

export function startInvoiceCleanupJob() {
  const schedule = process.env.INVOICE_CLEANUP_CRON || '30 1 * * *'; // default daily at 01:30

  // Schedule cron job
  const task = cron.schedule(schedule, () => {
    cleanupOldInvoices().catch((err) => console.error('[InvoiceCleanup] Scheduled run failed', err));
  });

  // Run once at startup
  cleanupOldInvoices().catch((err) => console.error('[InvoiceCleanup] Initial run failed', err));

  console.log(`[InvoiceCleanup] Scheduled with cron '${schedule}' and retentionDays=${process.env.INVOICE_RETENTION_DAYS ?? '365'}`);
  return task;
}

export default startInvoiceCleanupJob;
