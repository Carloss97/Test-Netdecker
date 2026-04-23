# Pasada 3: Hardening & Multi-Tenant Enforcement Checklist

**Objetivo**: Endurecer el modelo multi-tenant, RBAC, auditoría, inventario y pagos con criterios de aceptación concretos.

**Prioridad Recomendada**: Semana 1-2 (crítico), Semana 3-4 (alto), Semana 5+ (moderado)

---

## 🔴 SPRINT 1: CRÍTICO (2 semanas)

### ISSUE #P3-001: Enforce StoreId Mandatory en Listings, Orders, Cart

**Descripción**
El campo `storeId` en Listing, Order, y Cart es actualmente nullable (`String?`), permitiendo queries sin filtro de tienda. Esto es un **data leak crítico** donde listings de una tienda pueden ser visibles/modificables desde otra.

**Cómo Debería Funcionar**
- En producción, `storeId` es siempre requerido
- En importación/sync, cada listing/order DEBE estar asociado a una tienda específica
- Queries automáticamente filtran por `req.store.id` (via tenantResolver)
- Backfill: todos los registros null → migración que asigna a store por defecto o rechaza

**Cambios Técnicos**
1. [schema.prisma](backend/prisma/schema.prisma#L125): `storeId String!` (not nullable) en Listing
2. [schema.prisma](backend/prisma/schema.prisma#L400): `storeId String!` en Order
3. [schema.prisma](backend/prisma/schema.prisma#L652): `storeId String!` en Cart
4. Crear migración con backfill:
   ```sql
   UPDATE listings SET storeId = '00000000-0000-0000-0000-000000000001' WHERE storeId IS NULL;
   ALTER TABLE listings ALTER COLUMN storeId SET NOT NULL;
   ```
5. Actualizar servicios: ListingService, OrderService, CartService para siempre pasar storeId
6. Verificar rutas públicas no exponen listings sin filtro

**Criterios de Aceptación**
- [x] Migración Prisma crea campo obligatorio
- [x] Backfill de registros null → store por defecto (o rechazo si data inconsistente)
- [x] ListingService.createListing() rechaza si storeId no está en req context
- [x] GET /public/catalog filtra listingsbyStore (si es privado por store)
- [x] Todas queries a Listing tienen `.where({ storeId: req.store.id })`
- [x] Type-check y build pasan sin errors
- [x] Tests: ListingService.test.ts valida storeId enforcement
- [x] Documentation: CONTRIBUTING_PAGES.md actualiza que storeId es mandatory

**Estimado**: 3-4 horas

---

### ISSUE #P3-002: Implement Action-Based RBAC (Roles + Permissions)

**Descripción**
Los roles ADMIN/STAFF existen en DB pero no hay validación real de permisos. requireAdmin solo verifica presencia de token. Se necesita un sistema de **ACL granular** por acción (delete-listing, approve-price-change, etc.).

**Cómo Debería Funcionar**
1. **Roles con permisos explícitos**:
   - `ADMIN`: all permisos
   - `MANAGER`: approve-price-change, view-reports, manage-inventory (de su store)
   - `STAFF`: view-inventory, process-checkout (read-only para cartas)
   
2. **Middleware de autorización**:
   ```typescript
   app.post('/admin/listings/:id/delete', 
     requireAdmin, 
     requirePermission('delete-listing'),  // ← NEW
     deleteListing
   );
   ```

3. **Scoping automático por store**:
   - Si admin es MANAGER y storeId diferente en request → 403 Forbidden
   - Queries automáticamente filtran por store del admin

4. **Permissions Table**:
   - Nueva tabla en schema.prisma: `RolePermission { id, role, action, resource }`
   - Seed inicial con permisos estándar
   - AdminUser puede tener permisos extra via `AdminUserPermission`

**Cambios Técnicos**
1. Add [schema.prisma](backend/prisma/schema.prisma#L432): RolePermission model
   ```prisma
   model RolePermission {
     id String @id @default(cuid())
     role AdminUserRole  // ADMIN, MANAGER, STAFF
     action String      // "delete-listing", "approve-price-change"
     resource String    // "listing", "price", "order"
     createdAt DateTime @default(now())
     @@unique([role, action, resource])
   }
   ```

2. Crear middleware `requirePermission(action, resource)` en [middleware/](backend/src/middleware/):
   ```typescript
   export function requirePermission(action: string, resource?: string) {
     return async (req, res, next) => {
       const admin = req.admin; // from requireAdmin
       if (admin.role === 'ADMIN') {
         return next(); // admins have all perms
       }
       
       const hasPermission = await PermissionService.checkPermission(
         admin.id,
         action,
         resource
       );
       
       if (!hasPermission) {
         throw new ForbiddenError(`No permission for ${action}:${resource}`);
       }
       next();
     };
   }
   ```

3. Actualizar rutas admin:
   - [admin.listings.routes.ts](backend/src/routes/admin.listings.routes.ts): `requirePermission('delete', 'listing')`
   - [admin.prices.routes.ts](backend/src/routes/admin.prices.routes.ts): `requirePermission('approve', 'price')`
   - etc.

4. Crear seed para permisos estándar

5. Scoping por store:
   ```typescript
   // En requirePermission, si admin.role === MANAGER
   if (admin.storeId && admin.storeId !== req.store.id) {
     throw new ForbiddenError('Cannot access different store');
   }
   ```

**Criterios de Aceptación**
- [x] RolePermission model agregado a schema.prisma
- [x] Migración Prisma crea tabla y seed inicial
- [x] requirePermission middleware implementado y testeado
- [x] Todas rutas admin usan requirePermission() apropiadamente
- [x] ADMIN tiene all perms, MANAGER limitado a su store, STAFF read-only
- [x] Tests: AdminAuthService.test.ts + nuevos tests de permisos
- [x] API docs actualizado con permisos requeridos por endpoint
- [x] Logs muestran `reason: "insufficient permissions"` en 403

**Estimado**: 5-6 horas

---

### ISSUE #P3-003: Add Optimistic Locking to Reservation & Cart (Concurrency Control)

**Descripción**
En operaciones de inventario y checkout, existe **race condition** entre lectura de stock y venta. Sin optimistic locking, dos clientes pueden comprar el último item simultáneamente.

**Cómo Debería Funcionar**
1. Cada Reservation/CartItem tiene campo `version`
2. Al actualizar, se compara versión: si fue modificada por otro request, retorna **409 Conflict**
3. Cliente debe hacer retry (o carrito recalcula cantidades disponibles)

**Cambios Técnicos**
1. Actualizar [schema.prisma](backend/prisma/schema.prisma#L550):
   ```prisma
   model Reservation {
     // ... existing fields
     version Int @default(1)  // ← NEW: optimistic lock version
   }
   
   model CartItem {
     // ... existing fields
     version Int @default(1)  // ← NEW
   }
   ```

2. Crear migración:
   ```sql
   ALTER TABLE Reservation ADD COLUMN version INT DEFAULT 1;
   ALTER TABLE CartItem ADD COLUMN version INT DEFAULT 1;
   ```

3. Actualizar ReservationService.commitReservation():
   ```typescript
   // OLD: reads quantity, but qty can change before write
   const listing = await db.listing.findUnique({ where: { id } });
   
   // NEW: atomic update with version check
   const updated = await db.reservation.updateMany({
     where: {
       id: reservationId,
       version: expectedVersion,  // ← version check
     },
     data: {
       status: 'COMMITTED',
       version: { increment: 1 },  // ← increment version on success
     },
   });
   
   if (updated.count === 0) {
     throw new ConflictError('Reservation was modified, please retry');
   }
   ```

4. Hacer lo mismo en CartService.updateItemQuantity():
   ```typescript
   await db.cartItem.updateMany({
     where: {
       id: cartItemId,
       version: currentVersion,
     },
     data: {
       quantity: newQuantity,
       version: { increment: 1 },
     },
   });
   ```

5. Frontend maneja 409 Conflict:
   - Recarga carrito del servidor
   - Muestra: "Tu carrito cambió, por favor revisar cantidades"

**Criterios de Aceptación**
- [x] Migración agrega `version` fields
- [x] ReservationService uses optimistic locking
- [x] CartService uses optimistic locking
- [x] Tests de concurrencia: 10 requests paralelos compiten por 1 item → solo 1 gana
- [x] API retorna 409 Conflict con descripción clara
- [x] Frontend tests manejan 409 gracefully

**Estimado**: 4-5 horas

---

### ISSUE #P3-004: Audit Logging Enhancement (Entity-Level Diffs + FK to AdminUser)

**Descripción**
AuditTrail registra requests pero sin detalles de qué cambió exactamente. PriceHistory tiene antes/después pero no sabe quién hizo el cambio. Se necesita auditoría **granular de cambios**.

**Cómo Debería Funcionar**
1. Cada cambio registra: **entityType, entityId, oldValue, newValue, changedBy (FK)**
2. Ejemplo: "User admin@store.com changed Listing#123 price from 10 to 12.5"
3. Permite auditoría de "quién cambió qué" y "cuándo cambió qué valor"

**Cambios Técnicos**
1. Actualizar [schema.prisma](backend/prisma/schema.prisma#L183):
   ```prisma
   model PriceHistory {
     // ... existing
     changedBy String           // ← Make it FK, not just string
     changedByUser AdminUser? @relation("PriceChanges", fields: [changedBy], references: [id])
     @@index([changedBy])
   }
   
   model AuditTrail {
     // Expand to capture entity-level changes
     entityType String       // "listing", "price", "order"
     entityId String         // listing ID, etc.
     operation String        // "CREATE", "UPDATE", "DELETE"
     oldValue Json?          // old state
     newValue Json?          // new state
     diff Json?              // what changed (computed from old/new)
   }
   ```

2. Crear AuditHelper en services:
   ```typescript
   export async function auditEntityChange(
     entityType: 'listing' | 'price' | 'order',
     entityId: string,
     oldValue: any,
     newValue: any,
     changedBy: string  // AdminUser.id
   ) {
     const diff = computeDiff(oldValue, newValue);
     await db.auditTrail.create({
       data: {
         entityType,
         entityId,
         operation: 'UPDATE',
         oldValue,
         newValue,
         diff,
         userId: changedBy,
         // ...
       },
     });
   }
   ```

3. Usar en PriceService.updateListingPrice():
   ```typescript
   const oldPrice = listing.price;
   const updated = await PriceService.updateListingPrice(listingId, newPrice);
   
   await auditEntityChange(
     'listing',
     listingId,
     { price: oldPrice },
     { price: updated.price },
     req.admin.id
   );
   ```

4. Crear endpoint audit query: `GET /admin/audit?entityType=listing&entityId=123`
   - Devuelve histórico de cambios de esa entidad

**Criterios de Aceptación**
- [x] Schema.prisma expandido con entityType, oldValue, newValue, diff
- [x] PriceHistory.changedBy es FK a AdminUser
- [x] AuditHelper implementado
- [x] PriceService, ListingService, OrderService usan auditEntityChange()
- [x] GET /admin/audit retorna cambios con antes/después
- [x] Tests: Verify audit trail registra cambios correctamente

**Estimado**: 4-5 horas

---

## 🟠 SPRINT 2: ALTO (2 semanas)

### ISSUE #P3-005: Secrets Management & API Key Hashing

**Descripción**
IMPORT_API_KEY es un simple string en .env, sin hash ni rotación. Se necesita aplicar el mismo modelo de StoreService (hash + salt) y agregar rotación automática.

**Cómo Debería Funcionar**
1. Importa admin API key se hashea con scrypt (como Store.apiKeyHash)
2. Middleware requere hash antes de comparar
3. Job automático rota keys cada 90 días
4. Rotación logged en nueva tabla ApiKeyRotationLog

**Cambios Técnicos**
1. Crear modelo en [schema.prisma](backend/prisma/schema.prisma):
   ```prisma
   model ApiKey {
     id String @id @default(cuid())
     name String            // "IMPORT_API_KEY", "PRICE_SYNC_KEY"
     keyHash String         // hashed value
     keyType String         // "IMPORT", "PRICE_SYNC"
     createdAt DateTime @default(now())
     rotatedAt DateTime @default(now())
     expiresAt DateTime?    // optional: 90 days from rotatedAt
     isActive Boolean @default(true)
   }
   
   model ApiKeyRotationLog {
     id String @id @default(cuid())
     apiKeyId String
     apiKey ApiKey @relation(fields: [apiKeyId], references: [id])
     oldKeyHash String
     newKeyHash String
     reason String         // "auto-rotation", "manual-revoke"
     rotatedAt DateTime @default(now())
     rotatedBy String?     // AdminUser.id if manual
   }
   ```

2. Actualizar [requireApiKey.ts](backend/src/middleware/requireApiKey.ts):
   ```typescript
   export async function requireApiKey(req, res, next) {
     const keyHeader = req.headers['x-api-key'];
     if (!keyHeader) {
       throw new UnauthorizedError('Missing X-API-Key header');
     }
     
     const apiKey = await db.apiKey.findFirst({
       where: { isActive: true, keyType: 'IMPORT' }
     });
     
     if (!apiKey) {
       throw new InternalServerError('API key not configured');
     }
     
     const matches = await crypto.timingSafeEqual(
       Buffer.from(keyHash(keyHeader)),
       Buffer.from(apiKey.keyHash)
     ).catch(() => false);
     
     if (!matches) {
       throw new UnauthorizedError('Invalid API key');
     }
     
     next();
   }
   ```

3. Crear job para auto-rotación:
   ```typescript
   // In startupJobs()
   cron.schedule('0 0 1 * *', async () => {  // Monthly
     const importKey = await db.apiKey.findFirst({
       where: { keyType: 'IMPORT' }
     });
     
     if (importKey && isExpired(importKey)) {
       const newKey = generateSecureKey(32);
       await rotateApiKey(importKey.id, newKey, 'auto-rotation');
       console.info(`[ApiKeyRotation] IMPORT_API_KEY rotated`);
     }
   });
   ```

4. Crear endpoint para manual rotation:
   ```typescript
   POST /admin/api-keys/:id/rotate
   - requireAdmin
   - requirePermission('rotate', 'api-key')
   - Logs in ApiKeyRotationLog
   ```

**Criterios de Aceptación**
- [ ] ApiKey y ApiKeyRotationLog models added
- [ ] Migración crea tablas
- [ ] requireApiKey hashea y compara con timing-safe
- [ ] Auto-rotation job implementado (90-day window)
- [ ] Endpoint manual rotation protegido con requirePermission
- [ ] Rotación loguea oldKeyHash + newKeyHash + reason
- [ ] Tests: key hash/rotate/expiry

**Estimado**: 3-4 horas

---

### ISSUE #P3-006: Implement Webhook Retries & Dead Letter Queue for Stripe/MercadoPago

**Descripción**
Si un webhook de Stripe/MercadoPago falla, la orden puede no crearse. Se necesita **retry logic con exponential backoff** y una **dead letter queue** para investigación manual.

**Cómo Debería Funcionar**
1. Webhook recibido → validado → envuelto en Job
2. Job intenta procesar, con retries: 1s, 2s, 4s, 8s, 16s (max 5 intentos)
3. Si fallan todos → mueve a DeadLetterQueue
4. Admin puede inspeccionar DLQ y retriggerear manualmente

**Cambios Técnicos**
1. Crear tabla Job:
   ```prisma
   model WebhookJob {
     id String @id @default(cuid())
     provider String        // "STRIPE", "MERCADOPAGO"
     eventType String       // "payment_intent.succeeded"
     payload Json
     status String          // "PENDING", "PROCESSING", "COMPLETED", "FAILED"
     attempts Int @default(0)
     maxAttempts Int @default(5)
     nextRetryAt DateTime?
     error String?
     createdAt DateTime @default(now())
     processedAt DateTime?
   }
   
   model DeadLetterQueue {
     id String @id @default(cuid())
     webhookJobId String
     provider String
     error String
     createdAt DateTime @default(now())
     resolvedAt DateTime?
     resolvedBy String?     // AdminUser.id
   }
   ```

2. Crear [WebhookQueueService](backend/src/services/WebhookQueueService.ts):
   ```typescript
   export class WebhookQueueService {
     async enqueueWebhook(provider: 'STRIPE' | 'MERCADOPAGO', 
       eventType: string, payload: any) {
       return db.webhookJob.create({
         data: { provider, eventType, payload }
       });
     }
     
     async processQueue() {
       const pending = await db.webhookJob.findMany({
         where: { 
           status: 'PENDING',
           nextRetryAt: { lte: new Date() }
         },
         take: 10
       });
       
       for (const job of pending) {
         await this.processJob(job);
       }
     }
     
     private async processJob(job) {
       try {
         if (job.provider === 'STRIPE') {
           await StripeService.handleWebhook(job.payload);
         } else if (job.provider === 'MERCADOPAGO') {
           await MercadoPagoService.handleWebhook(job.payload);
         }
         
         await db.webhookJob.update({
           where: { id: job.id },
           data: { status: 'COMPLETED', processedAt: new Date() }
         });
       } catch (error) {
         await this.retryOrDLQ(job, error);
       }
     }
     
     private async retryOrDLQ(job, error) {
       if (job.attempts < job.maxAttempts) {
         const delayMs = 1000 * Math.pow(2, job.attempts);
         await db.webhookJob.update({
           where: { id: job.id },
           data: {
             status: 'PENDING',
             attempts: job.attempts + 1,
             nextRetryAt: new Date(Date.now() + delayMs),
             error: error.message
           }
         });
       } else {
         // Move to DLQ
         await db.deadLetterQueue.create({
           data: {
             webhookJobId: job.id,
             provider: job.provider,
             error: error.message
           }
         });
         
         await db.webhookJob.update({
           where: { id: job.id },
           data: { status: 'FAILED' }
         });
       }
     }
   }
   ```

3. Actualizar webhook handlers:
   ```typescript
   // payments.routes.ts
   POST /webhooks/stripe
   - Validar firma Stripe
   - Enqueue en WebhookQueueService
   - Return 202 Accepted
   
   // Scheduled job (cada 5 seg)
   cron.schedule('*/5 * * * * *', () => {
     WebhookQueueService.processQueue();
   });
   ```

4. Admin endpoint:
   ```typescript
   GET /admin/webhooks/dlq
   - List dead letter items
   - requirePermission('view', 'webhooks')
   
   POST /admin/webhooks/dlq/:id/retry
   - Requeue a DLQ job
   - requirePermission('retry', 'webhooks')
   ```

**Criterios de Aceptación**
- [ ] WebhookJob + DeadLetterQueue tables created
- [ ] WebhookQueueService implementado con retries
- [ ] Webhook handlers enqueue jobs (return 202)
- [ ] Background job procesa queue cada 5 segundos
- [ ] Failed retries → DLQ
- [ ] Admin endpoints para inspeccionar/retry DLQ
- [ ] Tests: simulate webhook failure, verify retry + DLQ

**Estimado**: 5-6 horas

---

### ISSUE #P3-007: MercadoPago Webhook Signature Verification

**Descripción**
Stripe valida firma de webhook, pero MercadoPago no. Esto permite ataques de webhook spoofing (alguien simula pago exitoso sin ser MP).

**Cómo Debería Funcionar**
1. MP webhook incluye firma en header `X-Signature`
2. Servidor re-computa HMAC(payload, MP_ACCESS_TOKEN) y compara
3. Si no coincide → 403 Forbidden

**Cambios Técnicos**
1. Actualizar [MercadoPagoService.ts](backend/src/services/MercadoPagoService.ts):
   ```typescript
   export class MercadoPagoService {
     static verifyWebhookSignature(payload: string, signature: string): boolean {
       const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
       const computed = crypto
         .createHmac('sha256', token)
         .update(payload)
         .digest('hex');
       
       return crypto.timingSafeEqual(
         Buffer.from(computed),
         Buffer.from(signature)
       );
     }
   }
   ```

2. Actualizar webhook handler:
   ```typescript
   POST /webhooks/mercadopago
   - get signature from headers['x-signature']
   - get raw body
   - verify: MercadoPagoService.verifyWebhookSignature()
   - if invalid: return 403
   - if valid: enqueue to WebhookQueueService
   ```

**Criterios de Aceptación**
- [ ] MercadoPagoService.verifyWebhookSignature() implementado
- [ ] Webhook handler valida firma antes de procesar
- [ ] Tests: valid + invalid signatures testeados
- [ ] Logs: log signature validation failures (potential attack)

**Estimado**: 1-2 horas

---

### ISSUE #P3-008: Add API Rate Limiting (Per-endpoint, Per-IP)

**Descripción**
Sin rate limiting, adversario puede spamear endpoints (login, import, search) causando DoS. Se necesita limitador de requests por IP/usuario.

**Cómo Debería Funcionar**
1. Middleware checkea Redis: `rate-limit:${ip}:${endpoint}` count
2. Si > límite en ventana (ej: 100 req/min) → 429 Too Many Requests
3. Diferentes límites por endpoint (auth más restrictivo que search)

**Cambios Técnicos**
1. Crear [RateLimitService.ts](backend/src/services/RateLimitService.ts):
   ```typescript
   export class RateLimitService {
     async checkLimit(
       key: string,              // "ip:1.2.3.4:auth", "user:123:prices"
       limit: number,            // max requests
       windowMs: number          // 60000 = 1 min
     ): Promise<{ allowed: boolean; remaining: number }> {
       const count = await redis.incr(key);
       
       if (count === 1) {
         await redis.expire(key, Math.ceil(windowMs / 1000));
       }
       
       return {
         allowed: count <= limit,
         remaining: Math.max(0, limit - count)
       };
     }
   }
   ```

2. Crear middleware [rateLimitByIp.ts](backend/src/middleware/rateLimitByIp.ts):
   ```typescript
   export function rateLimitByIp(
     limit: number = 100,
     windowMs: number = 60000
   ) {
     return async (req, res, next) => {
       const ip = req.ip || '0.0.0.0';
       const endpoint = req.path;
       const key = `rate-limit:${ip}:${endpoint}`;
       
       const result = await RateLimitService.checkLimit(key, limit, windowMs);
       
       res.set('X-RateLimit-Limit', limit.toString());
       res.set('X-RateLimit-Remaining', result.remaining.toString());
       
       if (!result.allowed) {
         throw new TooManyRequestsError('Rate limit exceeded');
       }
       
       next();
     };
   }
   ```

3. Aplicar a rutas críticas:
   ```typescript
   // auth
   app.post('/admin/auth/login', 
     rateLimitByIp(5, 60000),       // 5 per minute
     login
   );
   
   // search/import
   app.get('/api/external/search',
     rateLimitByIp(100, 60000),     // 100 per minute
     search
   );
   
   // price updates
   app.post('/admin/prices/:id',
     requireAdmin,
     rateLimitByIp(50, 60000),      // 50 per minute for admins
     updatePrice
   );
   ```

**Criterios de Aceptación**
- [ ] RateLimitService implementado
- [ ] rateLimitByIp middleware funcional
- [ ] Aplicado a: auth (5/min), search (100/min), admin updates (50/min)
- [ ] Headers X-RateLimit-* devueltos
- [ ] Tests: exceed limit → 429 TooManyRequests

**Estimado**: 2-3 horas

---

## 🟡 SPRINT 3: MODERADO (1-2 semanas)

### ISSUE #P3-009: Environment Variables Validation at Boot

**Descripción**
No hay validación de vars de entorno en startup. Si falta DATABASE_URL o está malformada, error ocurre tarde en runtime. Se necesita validación eager.

**Cómo Debería Funcionar**
1. Al iniciar, schema Zod valida todos los .env vars requeridos
2. Si alguno falta o es inválido → fallo inmediato con mensaje claro
3. Logs de startup indican variables cargadas (sin secretos)

**Cambios Técnicos**
1. Crear [src/utils/config.ts](backend/src/utils/config.ts):
   ```typescript
   import { z } from 'zod';
   
   const envSchema = z.object({
     NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
     PORT: z.string().default('3333').pipe(z.coerce.number()),
     DATABASE_URL: z.string().url().startsWith('postgresql://'),
     REDIS_URL: z.string().url().startsWith('redis://').optional(),
     STRIPE_SECRET: z.string().min(10),
     STRIPE_WEBHOOK_SECRET: z.string().min(10).optional(),
     MERCADOPAGO_ACCESS_TOKEN: z.string().optional(),
     PRICE_SYNC_CRON: z.string().regex(/^((\*|[0-9]|[1-5][0-9])...).+$/, {
       message: 'Invalid cron expression'
     }).optional(),
     CATALOG_SYNC_CRON: z.string().optional(),
     // ... más
   });
   
   export const config = envSchema.parse(process.env);
   ```

2. Usar en [index.ts](backend/src/index.ts):
   ```typescript
   import { config } from './utils/config';
   
   try {
     const validated = config;
     console.info('[Boot] Config validated successfully');
     console.info('[Boot] NODE_ENV:', validated.NODE_ENV);
     console.info('[Boot] Database:', validated.DATABASE_URL.split('@')[1]); // Hide user:pass
   } catch (error) {
     if (error instanceof z.ZodError) {
       console.error('[Boot] Configuration error:');
       error.errors.forEach(e => {
         console.error(`  - ${e.path.join('.')}: ${e.message}`);
       });
     }
     process.exit(1);
   }
   ```

**Criterios de Aceptación**
- [ ] Zod envSchema implementado
- [ ] Validación en boot antes de conectar DB
- [ ] Error detallado si variable inválida/faltante
- [ ] Tests: missing/invalid env → startup fails

**Estimado**: 1-2 horas

---

### ISSUE #P3-010: Implement Daily Payment Reconciliation Job

**Descripción**
No hay verificación de que órdenes en DB coincidan con transacciones en Stripe. Pueden existir órdenes ghost o pagos no reconciliados.

**Cómo Debería Funcionar**
1. Job diario compara Stripe transactions vs Order records
2. Genera reporte de discrepancias
3. Admin puede investigar y ajustar manualmente

**Cambios Técnicos**
1. Crear [PaymentReconciliationService.ts](backend/src/services/PaymentReconciliationService.ts):
   ```typescript
   export class PaymentReconciliationService {
     async reconcileDaily() {
       const yesterday = subDays(new Date(), 1);
       
       // Get Stripe transactions
       const stripeCharges = await StripeService.listCharges({
         created: { gte: yesterday, lt: new Date() }
       });
       
       // Get local orders
       const localOrders = await db.order.findMany({
         where: { createdAt: { gte: yesterday } }
       });
       
       const discrepancies = this.findDiscrepancies(stripeCharges, localOrders);
       
       if (discrepancies.length > 0) {
         await this.createReconciliationReport(discrepancies);
         await this.notifyAdmin(discrepancies);
       }
     }
     
     private findDiscrepancies(stripeCharges, localOrders) {
       const results = [];
       
       // Find Stripe charges not in DB
       for (const charge of stripeCharges) {
         const order = localOrders.find(o => o.stripeIntentId === charge.id);
         if (!order) {
           results.push({
             type: 'STRIPE_ORPHAN',
             stripeChargeId: charge.id,
             amount: charge.amount,
             message: `Stripe charge exists but no Order in DB`
           });
         }
       }
       
       // Find Orders not in Stripe
       for (const order of localOrders) {
         const charge = stripeCharges.find(c => c.id === order.stripeIntentId);
         if (!charge) {
           results.push({
             type: 'DB_ORPHAN',
             orderId: order.id,
             stripeIntentId: order.stripeIntentId,
             message: `Order in DB but no Stripe charge`
           });
         }
       }
       
       return results;
     }
   }
   ```

2. Agregar job al startup:
   ```typescript
   cron.schedule('0 2 * * *', async () => {  // 2 AM daily
     try {
       await PaymentReconciliationService.reconcileDaily();
     } catch (error) {
       console.error('[PaymentReconciliation] Error:', error);
     }
   });
   ```

3. Crear endpoint admin para ver reportes:
   ```typescript
   GET /admin/reconciliation/reports
   - requireAdmin
   - requirePermission('view', 'reconciliation')
   ```

**Criterios de Aceptación**
- [ ] PaymentReconciliationService implementado
- [ ] Job ejecuta diario
- [ ] Detecta orphans de ambos lados
- [ ] Reporte guardado en DB
- [ ] Admin endpoint lista reportes

**Estimado**: 2-3 horas

---

### ISSUE #P3-011: Test Coverage to 70%+ for Admin Routes & Concurrency

**Descripción**
Coverage actual ~30% para routes, ~20% para payments. Se necesita cobertura systematic de auth flows + concurrency.

**Cómo Debería Funcionar**
1. Admin auth integration tests (login, logout, session)
2. RBAC permission tests (admin can, manager cannot, etc.)
3. Concurrency stress tests (10 parallel reservations para 1 item)
4. E2E checkout flow con Playwright

**Cambios Técnicos**
1. Crear [admin.auth.routes.integration.test.ts](backend/src/routes/__tests__/admin.auth.routes.integration.test.ts):
   ```typescript
   describe('Admin Auth Routes', () => {
     it('POST /admin/auth/login - válido', async () => {
       const res = await request(app)
         .post('/admin/auth/login')
         .send({ email: 'admin@test.com', password: 'test123' })
         .expect(200);
       
       expect(res.body.success).toBe(true);
       expect(res.body.data.token).toBeDefined();
     });
     
     it('POST /admin/auth/login - fallido (wrong pass)', async () => {
       const res = await request(app)
         .post('/admin/auth/login')
         .send({ email: 'admin@test.com', password: 'wrong' })
         .expect(401);
       
       expect(res.body.error.code).toBe('UNAUTHORIZED');
     });
     
     it('GET /admin/auth/me - sin token → 401', async () => {
       const res = await request(app)
         .get('/admin/auth/me')
         .expect(401);
     });
   });
   ```

2. Crear [reservation.concurrency.test.ts](backend/src/services/__tests__/reservation.concurrency.test.ts):
   ```typescript
   describe('Reservation Concurrency', () => {
     it('10 parallel reservations for 1 item → only 1 succeeds', async () => {
       const listingId = await createListing({ quantity: 1 });
       
       const promises = Array(10).fill(null).map(() =>
         ReservationService.createReservation(listingId, 1)
       );
       
       const results = await Promise.allSettled(promises);
       const successes = results.filter(r => r.status === 'fulfilled').length;
       
       expect(successes).toBe(1);
     });
   });
   ```

3. Crear [checkout.e2e.test.ts](frontend/e2e/checkout.e2e.test.ts) con Playwright:
   ```typescript
   test('End-to-end checkout flow', async ({ page }) => {
     await page.goto('http://localhost:5173');
     
     // Search for card
     await page.fill('input[placeholder="Search cards"]', 'Black Lotus');
     await page.click('button:has-text("Search")');
     
     // Add to cart
     await page.click('button:has-text("Add to Cart")');
     
     // Go to checkout
     await page.goto('http://localhost:5173/checkout');
     await page.fill('input[name="email"]', 'test@example.com');
     
     // Mock Stripe
     await page.click('button:has-text("Pay Now")');
     
     // Success page
     await expect(page).toHaveURL(/.*\/order-confirmation/);
   });
   ```

**Criterios de Aceptación**
- [ ] Admin auth integration tests ~30 tests
- [ ] RBAC permission tests ~20 tests
- [ ] Concurrency tests en ReservationService
- [ ] E2E Playwright checkout test
- [ ] Coverage report muestra 70%+ en routes + services

**Estimado**: 6-8 horas

---

### ISSUE #P3-012: Cash Session Reconciliation in POS

**Descripción**
POS registra transacciones pero no hay reconciliación de efectivo. Cajero puede registrar $1000 en caja pero solo depositar $900.

**Cómo Debería Funcionar**
1. Cashier cierra sesión: registra cantidad de efectivo físico en caja
2. Sistema compara: efectivo registrado vs efectivo teórico (basado en transacciones)
3. Si hay discrepancia → genera Discrepancy report para revisar

**Cambios Técnicos**
1. Actualizar [schema.prisma](backend/prisma/schema.prisma#L580):
   ```prisma
   model CashSession {
     // ... existing
     actualCashAmount Decimal?      // ← What cashier counted
     theoreticalAmount Decimal      // ← From transactions
     discrepancy Decimal?            // actualCash - theoretical
     status String                  // "OPEN", "CLOSING", "CLOSED", "DISCREPANCY"
   }
   ```

2. Crear endpoint para cerrar sesión:
   ```typescript
   POST /admin/pos/sessions/:id/close
   - requireAdmin
   - body: { actualCashAmount }
   - calcula discrepancia
   - crea DiscrepancyLog si hay diferencia
   ```

3. Admin ve discrepancias:
   ```typescript
   GET /admin/pos/discrepancies
   - Lista todas las discrepancias
   - requirePermission('view', 'cash-discrepancies')
   ```

**Criterios de Aceptación**
- [ ] CashSession schema actualizado
- [ ] Endpoint /close calcula discrepancia
- [ ] DiscrepancyLog creado si no coincide
- [ ] Admin endpoint lista discrepancias
- [ ] Tests: reconciliación correcta

**Estimado**: 2-3 horas

---

## 🟢 SPRINT 4: DEMOSTRACIÓN (2-3 días)

### ISSUE #P3-DEMO: Build Modern TCG Store Showcase Page

**Descripción**
Crear una página web de demostración estilo **deckscards.cl** para mostrar cómo se vería una tienda de cartas en producción: búsqueda, filtros, carrito, checkout.

**Estructura**
- Página landing con catálogo de cartas
- Filtros inteligentes (TCG, rarity, precio)
- Ficha de producto con imagen, stock, precio
- Carrito persistente
- Checkout mockado
- Diseño moderno y responsive

**Componentes React Nuevos**
```
frontend/src/pages/
├── StorefrontPage.tsx       ← Main catalog
├── ProductDetailPage.tsx    ← Card details
└── CheckoutPage.tsx         ← Checkout demo

frontend/src/components/storefront/
├── ProductCard.tsx
├── ProductGrid.tsx
├── FilterSidebar.tsx
├── ShoppingCart.tsx
├── PriceDisplay.tsx
└── RarityBadge.tsx

frontend/src/hooks/
├── useStorefront.ts         ← Fetch catalogstyle
└── useCartPersist.ts        ← Local storage cart
```

**Criterios de Aceptación**
- [ ] Landing page con hero section
- [ ] Catálogo con grid de cartas
- [ ] Filtros por TCG, rarity, precio (min-max)
- [ ] Search bar con autocomplete
- [ ] Product modal con imagen grande + detalles
- [ ] Carrito flotante
- [ ] Checkout form (no payment processing)
- [ ] Responsive mobile + desktop
- [ ] Dark/light mode support

**Estimado**: 2-3 días (opcional, depende de prioridad)

---

## 📊 Resumen de Esfuerzo

| Sprint | Issues | Horas Est. | Semanas |
|--------|--------|-----------|---------|
| 1: Crítico | #001-004 | 16-18 h | 2 |
| 2: Alto | #005-008 | 15-18 h | 2 |
| 3: Moderado | #009-012 | 10-15 h | 1-2 |
| 4: Demo | #DEMO | 16-24 h | 2-3 |
| **Total** | | **57-75 h** | **8-10 semanas** |

---

## 🚀 Priorización por Riesgo/Impacto

| Prioridad | Issue | Riesgo | Impacto |
|-----------|-------|--------|--------|
| **CRÍTICO** | #P3-001 (storeId) | Data leak | 10/10 |
| **CRÍTICO** | #P3-003 (Locks) | Overselling | 9/10 |
| **CRÍTICO** | #P3-002 (RBAC) | Unauthorized access | 9/10 |
| **ALTO** | #P3-004 (Audit) | Compliance | 7/10 |
| **ALTO** | #P3-005 (API keys) | Credential theft | 7/10 |
| **ALTO** | #P3-006 (Webhooks) | Payment loss | 8/10 |
| **MODERADO** | #P3-007 (MP sig) | Webhook spoofing | 5/10 |
| **MODERADO** | #P3-008 (RateLimit) | DoS | 6/10 |
| **MODERADO** | #P3-009 (Env) | Configuration error | 4/10 |
| **BAJO** | #P3-010 (Reconciliation) | Financial discrepancy | 5/10 |
| **BAJO** | #P3-011 (Tests) | Regressions | 4/10 |
| **BAJO** | #P3-012 (Cash reconciliation) | Audit trail | 3/10 |

---

## ✅ Próximos Pasos

1. **Priorizar según riesgo**: Empezar con #P3-001, #P3-003, #P3-002
2. **Crear branches**: `feature/p3-storeId`, `feature/p3-rbac`, etc.
3. **Establecer criteria de merge**: Todos los tests en verde + cobertura 70%+
4. **Revisar con team** weekly para identificar blockers
5. **Documentar** cada issue en CONTRIBUTING_PAGES.md

---

**Creado**: 2026-04-23  
**Scope**: Full backend hardening + optional demo store  
**Owner**: Development Team
