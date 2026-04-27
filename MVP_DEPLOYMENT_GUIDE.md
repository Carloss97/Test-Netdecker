# 🚀 Guía de Configuración MVP - Netdecker

Este documento contiene las variables de entorno y pasos necesarios para operar la plataforma en producción (Render + Vercel).

---

## 1. Backend (Render)
Configurar en: **Render Dashboard > Dashboard > Backend Service > Environment**

### 🔑 Autenticación y Base de Datos
- `DATABASE_URL`: URL de conexión de Neon Postgres.
- `JWT_SECRET`: Cadena aleatoria larga para seguridad de sesiones.
- `NODE_ENV`: `production`

### 💳 Pasarelas de Pago
- `WEBHOOK_QUEUE_ENABLED`: `true` (Activa el procesamiento de pagos).
- `MERCADOPAGO_ACCESS_TOKEN`: Token privado de Mercado Pago.
- `STRIPE_SECRET_KEY`: Llave privada de Stripe.
- `STRIPE_WEBHOOK_SECRET`: Llave de validación de webhooks de Stripe.

### 📧 Notificaciones por Email (Nodemailer)
- `SMTP_HOST`: Servidor SMTP (ej: `smtp.resend.com`, `smtp.gmail.com`).
- `SMTP_PORT`: `587` (o `465` para SSL).
- `SMTP_USER`: Tu usuario de correo.
- `SMTP_PASS`: Tu contraseña o API Key.
- `SMTP_FROM`: `"Netdecker" <ventas@tudominio.cl>`

### ⚙️ Reglas de Negocio
- `PRICE_APPROVAL_REQUIRED`: `true` (Para validar cambios de precio volátiles).
- `CORS_ORIGIN`: URL de tu frontend en Vercel.

---

## 2. Frontend (Vercel)
Configurar en: **Vercel > Project Settings > Environment Variables**

- `VITE_API_BASE_URL`: `https://tu-backend.onrender.com/api`
- `VITE_STRIPE_PUBLISHABLE`: Llave pública de Stripe.

---

## 🛠 Pasos Críticos de Mantenimiento

### Actualizar la Base de Datos (Tras cambios de esquema)
Cada vez que veas un cambio en `schema.prisma`, debes ejecutar esto desde tu terminal local:
```bash
cd backend
npx prisma db push
```

### Configurar Webhooks Externos
Para que los pagos se marquen como pagados automáticamente, configura estas URLs en los paneles de desarrollador:
1. **Mercado Pago**: `https://tu-backend.onrender.com/api/payments/mercadopago/webhook`
2. **Stripe**: `https://tu-backend.onrender.com/api/payments/stripe/webhook`

---
*Documento generado el 26 de abril de 2026 para la fase de lanzamiento MVP.*
