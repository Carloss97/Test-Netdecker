import nodemailer from 'nodemailer';
import type { Order, Store } from '@prisma/client';

export class EmailNotificationService {
  private static getTransporter() {
    // These should be configured in .env
    const host = process.env.SMTP_HOST || '';
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASS || '';
    const from = process.env.SMTP_FROM || '"Netdecker" <noreply@krumm.cl>';

    if (!host || !user || !pass) {
      console.warn('[EmailNotificationService] SMTP not configured. Emails will be logged to console only.');
      return null;
    }

    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  static async sendOrderStatusEmail(order: Order & { items?: any[], store?: Store }, status: string) {
    const transporter = this.getTransporter();
    const customerEmail = order.customerEmail;
    if (!customerEmail || customerEmail === 'POS') return;

    const storeName = order.store?.name || 'Netdecker';
    const subject = `Actualización de tu pedido ${order.orderNumber} - ${storeName}`;
    
    let message = '';
    switch (status) {
      case 'PAID':
        message = `¡Gracias por tu compra! Tu pago ha sido confirmado. Estamos preparando tus cartas.`;
        break;
      case 'READY_FOR_PICKUP':
        message = `Tu pedido está listo para ser retirado en nuestra tienda. ¡Te esperamos!`;
        break;
      case 'SHIPPED':
        message = `Buenas noticias: tus cartas ya están en camino. Pronto recibirás tu número de seguimiento.`;
        break;
      case 'DELIVERED':
        message = `Tu pedido ha sido entregado. ¡Esperamos que disfrutes tus nuevas cartas!`;
        break;
      case 'CANCELLED':
        message = `Tu pedido ${order.orderNumber} ha sido cancelado. Si tienes dudas, contáctanos.`;
        break;
      default:
        message = `El estado de tu pedido ha cambiado a: ${status}.`;
    }

    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
        <h2 style="color: #0f766e;">${storeName}</h2>
        <p>Hola,</p>
        <p>${message}</p>
        <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="margin-top: 0;">Resumen del Pedido #${order.orderNumber}</h4>
          <p style="font-size: 0.9rem;">Total: ${new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(order.total)}</p>
        </div>
        <p style="font-size: 0.8rem; color: #666;">Gracias por confiar en nosotros.</p>
      </div>
    `;

    if (!transporter) {
      console.log(`[Email Mock] To: ${customerEmail} | Subject: ${subject} | Body: ${message}`);
      return;
    }

    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || '"Netdecker" <noreply@krumm.cl>',
        to: customerEmail,
        subject,
        html,
      });
      console.log(`[EmailNotificationService] Email sent to ${customerEmail} for order ${order.orderNumber}`);
    } catch (err) {
      console.error('[EmailNotificationService] Failed to send email:', err);
    }
  }
}

export default EmailNotificationService;
