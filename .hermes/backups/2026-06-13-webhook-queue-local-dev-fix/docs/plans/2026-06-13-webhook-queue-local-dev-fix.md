# Webhook Queue Local Dev Fix Implementation Plan

> **For Hermes:** Implementar con TDD estricto y verificación real antes de reportar.

**Goal:** eliminar el spam `[WebhookQueueJob] Failed: Cannot read properties of undefined (reading 'findMany')` al ejecutar `npm run dev` en desarrollo local.

**Architecture:** la cola de webhooks de pagos es una integración externa/no esencial para el MVP local-first con TCGCSV. El servicio debe detectar si los delegates Prisma `webhookJob` y `deadLetterQueue` existen antes de consultarlos, y el cron debe permanecer apagado por defecto en modo local salvo opt-in explícito. Esto evita errores repetidos sin romper el contrato de producción cuando la cola exista y se habilite con env.

**Tech Stack:** Node.js, TypeScript, tsx test runner, Prisma dinámico SQLite/Postgres, node-cron.

---

## Root cause confirmado

- El log de `npm run dev` apunta a `backend/src/services/WebhookQueueService.ts:50`.
- Esa línea ejecuta `prisma.webhookJob.findMany(...)`.
- La búsqueda en `backend/prisma/schema.prisma` no encuentra modelos `WebhookJob` ni `DeadLetterQueue`.
- En local se carga `@prisma/client_sqlite_generated`; por tanto `prisma.webhookJob` queda `undefined`.
- `backend/src/jobs/webhookQueue.job.ts` agenda el job cada 5 segundos por defecto, así que el error se repite indefinidamente.

## Fase A — Test RED para delegate Prisma ausente

**Estado:** [~] En trabajo  
**Prioridad:** Alta  
**Objetivo:** documentar que `processQueue()` debe ser seguro cuando `prisma.webhookJob` no existe.

**Archivos:**
- Modificar: `backend/src/services/WebhookQueueService.test.ts`
- Modificar: `backend/src/services/WebhookQueueService.ts`

**Tareas:**
1. Agregar test que simule `prisma.webhookJob = undefined`.
2. Ejecutarlo focalizado y confirmar RED.
3. Implementar guard helper para verificar disponibilidad de cola.
4. Hacer que `processQueue()` retorne skip seguro si falta el delegate.

**Criterio de éxito:** el test falla antes del fix y pasa después; no hay lectura de `findMany` sobre `undefined`.

## Fase B — Cron apagado por defecto en local

**Estado:** [ ] Por implementar  
**Prioridad:** Alta  
**Objetivo:** impedir que una integración externa/no esencial se ejecute cada 5 segundos durante desarrollo local.

**Archivos:**
- Modificar: `backend/src/jobs/webhookQueue.job.ts`
- Test opcional focalizado si ya existe patrón de jobs; si no, cubrir por test de servicio + smoke dev.

**Tareas:**
1. Cambiar habilitación del cron a opt-in explícito: `WEBHOOK_QUEUE_ENABLED=true`.
2. Loguear claramente cuando queda deshabilitado.
3. Mantener soporte de cron cuando el env esté habilitado.

**Criterio de éxito:** `npm run dev` no imprime spam de `WebhookQueueJob` en local.

## Fase C — Seguridad en endpoints admin/webhook

**Estado:** [ ] Por implementar  
**Prioridad:** Media  
**Objetivo:** evitar que `dlq`/retry fallen con 500 si el modelo de cola no existe en SQLite local.

**Archivos:**
- Modificar: `backend/src/services/WebhookQueueService.ts`
- Modificar: `backend/src/services/WebhookQueueService.test.ts`

**Tareas:**
1. Hacer `getDeadLetterItems()` seguro cuando no exista `deadLetterQueue`.
2. Hacer `retryDeadLetterItem()` devuelva error controlado si la cola no está disponible.

**Criterio de éxito:** endpoints de administración no crashean por delegates ausentes.

## Fase D — Verificación

**Estado:** [ ] Por implementar  
**Prioridad:** Alta  
**Comandos:**
1. `cd backend && npx tsx --test --test-name-pattern "webhook queue unavailable|WebhookQueueService retries|WebhookQueueService moves" src/services/WebhookQueueService.test.ts`
2. `npm --prefix backend run type-check`
3. `npm run build`
4. Smoke local: arrancar `npm run dev`, observar unos segundos, verificar que backend/frontend suben y que no aparece el spam de `WebhookQueueJob`.

**Criterio de éxito:** tests/type-check/build OK y dev server sin spam del WebhookQueueJob.
