import prisma from '../utils/db.js';
import { ConflictError, ValidationError } from '../utils/errors.js';
import PaymentService from './PaymentService.js';

type WebhookProvider = 'STRIPE' | 'MERCADOPAGO';

type WebhookJobRecord = {
  id: string;
  provider: WebhookProvider;
  eventType: string;
  payload: any;
  status: string;
  attempts: number;
  maxAttempts: number;
  nextRetryAt?: Date | null;
  error?: string | null;
};

function getPayloadObject(payload: unknown): Record<string, any> {
  return payload && typeof payload === 'object' ? (payload as Record<string, any>) : {};
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Unknown webhook processing error';
  }
}

export class WebhookQueueService {
  static async enqueueWebhook(provider: WebhookProvider, eventType: string, payload: unknown) {
    return prisma.webhookJob.create({
      data: {
        provider,
        eventType,
        payload,
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 5,
        nextRetryAt: new Date(),
      },
    });
  }

  static async processQueue(limit = 10) {
    const now = new Date();
    const jobs = await prisma.webhookJob.findMany({ orderBy: [{ createdAt: 'asc' }], take: limit });

    const pendingJobs = (jobs as WebhookJobRecord[]).filter((job) => {
      if (job.status !== 'PENDING') return false;
      if (!job.nextRetryAt) return true;
      return job.nextRetryAt.getTime() <= now.getTime();
    });

    for (const job of pendingJobs) {
      await this.processJob(job);
    }
  }

  static async processJob(job: WebhookJobRecord) {
    const locked = await prisma.webhookJob.updateMany({
      where: { id: job.id, status: 'PENDING' },
      data: { status: 'PROCESSING' },
    });

    if (locked.count === 0) {
      return { skipped: true };
    }

    try {
      if (job.provider === 'STRIPE') {
        await this.processStripeWebhookPayload(job.payload);
      } else if (job.provider === 'MERCADOPAGO') {
        await this.processMercadoPagoWebhookPayload(job.payload);
      } else {
        throw new ValidationError(`Unsupported webhook provider: ${job.provider}`);
      }

      await prisma.webhookJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          processedAt: new Date(),
          error: null,
        },
      });

      return { completed: true };
    } catch (error) {
      await this.retryOrMoveToDlq(job, error);
      return { completed: false, error: extractErrorMessage(error) };
    }
  }

  static async processWebhookPayload(provider: WebhookProvider, payload: unknown) {
    if (provider === 'STRIPE') {
      return this.processStripeWebhookPayload(payload);
    }
    return this.processMercadoPagoWebhookPayload(payload);
  }

  static async processStripeWebhookPayload(payload: unknown) {
    const event = getPayloadObject(payload);
    if (event.type !== 'payment_intent.succeeded') {
      return { received: true };
    }

    const intent = getPayloadObject(event.data?.object);
    const itemsJson = intent.metadata?.items || intent.metadata?.Items || null;
    if (!itemsJson) {
      return { received: true };
    }

    let items: Array<{ listingId: string; quantity: number }> = [];
    try {
      items = JSON.parse(String(itemsJson));
    } catch {
      throw new ValidationError('Invalid items metadata');
    }

    const paymentIntentId = String(intent.id || '');
    if (!paymentIntentId) {
      throw new ValidationError('Invalid Stripe webhook payload');
    }

    const existing = await prisma.order.findFirst({ where: { notes: String(`stripe_intent:${paymentIntentId}`) } });
    if (existing) {
      return { received: true, note: 'Already processed' };
    }

    await PaymentService.processPosSale({
      items,
      storeId: intent.metadata?.storeId || null,
      paymentMethod: 'CARD',
      externalReference: `stripe_intent:${paymentIntentId}`,
    } as any);

    return { received: true };
  }

  static async processMercadoPagoWebhookPayload(payload: unknown) {
    const event = getPayloadObject(payload);
    const eventType = String(event.type || event.topic || event.action || '').toLowerCase();
    if (eventType && !eventType.includes('payment') && !eventType.includes('order')) {
      return { received: true };
    }

    const payment = getPayloadObject(event.data?.object || event.data?.payment || event.data || event);
    const status = String(payment.status || payment.payment_status || event.status || '').toLowerCase();
    if (status && !['approved', 'paid', 'succeeded'].includes(status)) {
      return { received: true };
    }

    const metadata = getPayloadObject(payment.metadata || event.metadata || event.data?.metadata || {});
    const itemsJson = metadata.items || payment.items || event.items || null;
    if (!itemsJson) {
      throw new ValidationError('Invalid MercadoPago webhook payload');
    }

    let items: Array<{ listingId: string; quantity: number }> = [];
    try {
      items = JSON.parse(String(itemsJson));
    } catch {
      throw new ValidationError('Invalid MercadoPago webhook payload');
    }

    const paymentId = String(payment.id || event.id || metadata.paymentId || payment.external_reference || '');
    if (!paymentId) {
      throw new ValidationError('Invalid MercadoPago webhook payload');
    }

    const existing = await prisma.order.findFirst({ where: { notes: String(`mercadopago_payment:${paymentId}`) } });
    if (existing) {
      return { received: true, note: 'Already processed' };
    }

    await PaymentService.processPosSale({
      items,
      storeId: String(metadata.storeId || payment.storeId || event.storeId || '') || null,
      paymentMethod: 'MERCADOPAGO',
      externalReference: `mercadopago_payment:${paymentId}`,
    } as any);

    return { received: true };
  }

  static async getDeadLetterItems(limit = 50) {
    const items = await prisma.deadLetterQueue.findMany({ include: { webhookJob: true } });
    return [...items]
      .filter((item: { resolvedAt?: Date | null }) => item.resolvedAt == null)
      .sort((left: { createdAt: Date }, right: { createdAt: Date }) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, limit);
  }

  static async retryDeadLetterItem(deadLetterId: string, retriedBy?: string | null) {
    const deadLetter = await prisma.deadLetterQueue.findUnique({
      where: { id: deadLetterId },
      include: { webhookJob: true },
    });

    if (!deadLetter) {
      throw new ValidationError('Dead letter entry not found');
    }

    await prisma.webhookJob.update({
      where: { id: deadLetter.webhookJobId },
      data: {
        status: 'PENDING',
        attempts: 0,
        error: null,
        nextRetryAt: new Date(),
      },
    });

    await prisma.deadLetterQueue.update({
      where: { id: deadLetter.id },
      data: {
        resolvedAt: new Date(),
        resolvedBy: retriedBy || null,
      },
    });

    return { success: true, webhookJobId: deadLetter.webhookJobId };
  }

  static async retryOrMoveToDlq(job: WebhookJobRecord, error: unknown) {
    const errorMessage = extractErrorMessage(error);
    const currentAttempts = Number(job.attempts || 0);
    const maxAttempts = Number(job.maxAttempts || 5);

    if (currentAttempts < maxAttempts) {
      const delayMs = 1000 * Math.pow(2, currentAttempts);
      await prisma.webhookJob.update({
        where: { id: job.id },
        data: {
          status: 'PENDING',
          attempts: currentAttempts + 1,
          nextRetryAt: new Date(Date.now() + delayMs),
          error: errorMessage,
        },
      });
      return;
    }

    await prisma.deadLetterQueue.create({
      data: {
        webhookJobId: job.id,
        provider: job.provider,
        error: errorMessage,
      },
    });

    await prisma.webhookJob.update({
      where: { id: job.id },
      data: {
        status: 'FAILED',
        error: errorMessage,
        processedAt: new Date(),
      },
    });
  }
}

export default WebhookQueueService;