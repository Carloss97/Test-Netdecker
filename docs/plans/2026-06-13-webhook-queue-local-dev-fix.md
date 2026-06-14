# Webhook Queue Local Dev Fix Implementation Plan

> **For Hermes:** Implementar con TDD estricto y verificación real antes de reportar.

**Goal:** eliminar el spam `[WebhookQueueJob] Failed: Cannot read properties of undefined (reading 'findMany')` al ejecutar `npm run dev` en desarrollo local.

**Architecture:** la cola de webhooks de pagos es una integración externa/no esencial para el MVP local-first con TCGCSV. El servicio detecta si los delegates Prisma `webhookJob` y `deadLetterQueue` existen antes de consultarlos, y el cron queda apagado por defecto en modo local salvo opt-in explícito. Esto evita errores repetidos sin romper el contrato de producción cuando la cola exista y se habilite con env.

**Tech Stack:** Node.js, TypeScript, tsx test runner, Prisma dinámico SQLite/Postgres, node-cron.

---

## Root cause confirmado

- El log de `npm run dev` apunta a `backend/src/services/WebhookQueueService.ts:50`.
- Esa línea ejecutaba `prisma.webhookJob.findMany(...)`.
- La búsqueda en `backend/prisma/schema.prisma` no encuentra modelos `WebhookJob` ni `DeadLetterQueue`.
- En local se carga `@prisma/client_sqlite_generated`; por tanto `prisma.webhookJob` queda `undefined`.
- `backend/src/jobs/webhookQueue.job.ts` agendaba el job cada 5 segundos por defecto, así que el error se repetía indefinidamente.

## Fase A — Test RED para delegate Prisma ausente

**Estado:** [x] Completado  
**Prioridad:** Alta  
**Objetivo:** documentar que `processQueue()` debe ser seguro cuando `prisma.webhookJob` no existe.

**Archivos:**
- Modificar: `backend/src/services/WebhookQueueService.test.ts`
- Modificar: `backend/src/services/WebhookQueueService.ts`

**Tareas:**
1. [x] Agregar test que simula `prisma.webhookJob = undefined`.
2. [x] Ejecutarlo focalizado y confirmar RED.
3. [x] Implementar guard helper para verificar disponibilidad de cola.
4. [x] Hacer que `processQueue()` retorne skip seguro si falta el delegate.

**Criterio de éxito:** el test falla antes del fix y pasa después; no hay lectura de `findMany` sobre `undefined`.

**Evidencia:** RED reproducido con `cd backend && npx tsx --test --test-name-pattern "webhook tables are unavailable" src/services/WebhookQueueService.test.ts`: falló en `WebhookQueueService.ts:50` por `Cannot read properties of undefined (reading 'findMany')`.

## Fase B — Cron apagado por defecto en local

**Estado:** [x] Completado  
**Prioridad:** Alta  
**Objetivo:** impedir que una integración externa/no esencial se ejecute cada 5 segundos durante desarrollo local.

**Archivos:**
- Modificar: `backend/src/jobs/webhookQueue.job.ts`
- Cubrir por test de servicio + smoke dev.

**Tareas:**
1. [x] Cambiar habilitación del cron a default derivado de `!isLocalOnlyMode()` con opt-in explícito `WEBHOOK_QUEUE_ENABLED=true`.
2. [x] Loguear claramente cuando queda deshabilitado.
3. [x] Mantener soporte de cron cuando el env esté habilitado y existan tablas/delegates.

**Criterio de éxito:** `npm run dev` no imprime spam de `WebhookQueueJob` en local.

**Evidencia:** smoke backend con `PORT=3335 NODE_ENV=development npm --prefix backend run dev` mostró `[WebhookQueueJob] Disabled. Set WEBHOOK_QUEUE_ENABLED=true to enable queued payment webhooks.` y no repitió errores de `findMany` tras esperar ticks adicionales.

## Fase C — Seguridad en endpoints admin/webhook

**Estado:** [x] Completado  
**Prioridad:** Media  
**Objetivo:** evitar que `dlq`/retry fallen con 500 si el modelo de cola no existe en SQLite local.

**Archivos:**
- Modificar: `backend/src/services/WebhookQueueService.ts`
- Modificar: `backend/src/services/WebhookQueueService.test.ts`

**Tareas:**
1. [x] Hacer `getDeadLetterItems()` seguro cuando no exista `deadLetterQueue`.
2. [x] Hacer `retryDeadLetterItem()` devuelva error controlado si la cola no está disponible.

**Criterio de éxito:** endpoints de administración no crashean por delegates ausentes.

**Evidencia:** `getDeadLetterItems()` retorna `[]` si falta `deadLetterQueue`; `retryDeadLetterItem()` falla de forma controlada con `ValidationError` cuando la cola no está disponible.

## Fase D — Verificación

**Estado:** [x] Completado  
**Prioridad:** Alta  
**Comandos:**
1. `cd backend && npx tsx --test --test-name-pattern "webhook tables are unavailable|WebhookQueueService retries|WebhookQueueService moves" src/services/WebhookQueueService.test.ts`
2. `npm --prefix backend run type-check`
3. `npm run build`
4. Smoke local: backend con puerto alternativo para evitar conflicto con servidor del usuario.

**Criterio de éxito:** tests/type-check/build OK y dev server sin spam del WebhookQueueJob.

**Evidencia:**
1. `cd backend && npx tsx --test --test-name-pattern "webhook tables are unavailable|WebhookQueueService retries|WebhookQueueService moves" src/services/WebhookQueueService.test.ts` — `3 passed / 0 failed`.
2. `npm --prefix backend run type-check` — OK.
3. `npm run build` — OK.
4. Smoke backend `PORT=3335 NODE_ENV=development npm --prefix backend run dev` — servidor subió en puerto 3335, cron de webhooks quedó deshabilitado y no apareció `[WebhookQueueJob] Failed`.

## Nota operativa

Si más adelante se requiere probar webhooks externos en un entorno que sí tenga modelos de cola, configurar explícitamente:

```bash
WEBHOOK_QUEUE_ENABLED=true
LOCAL_ONLY_MODE=false
```

En el MVP local-first/TCGCSV, la cola permanece deshabilitada por defecto.
