# Sprint 1 - Abril 2026

**Duracion:** 2 semanas (04/04/2026 - 18/04/2026)

## Objetivo del Sprint

Cerrar brechas criticas para operacion diaria estable: inventario masivo robusto, pricing pipeline completo y admin funcional sin apoyo tecnico.

## Historias y Tareas

### 1. Backfill de `tcgplayerProductId` por lotes
- Ejecutar comando/endpoint de backfill sobre todo el catalogo.
- Medir y reportar cobertura final por TCG (Magic, Pokemon, Yu-Gi-Oh!, One Piece).
- Documentar % de cartas con productId y casos sin match.
- Criterio de cierre: 95%+ de cartas con productId o justificacion clara de faltantes.

### 2. Umbrales de volatilidad y aprobacion manual
- Implementar configuracion de umbrales de volatilidad por TCG y edicion.
- Agregar flujo de aprobacion manual para cambios de precio extremos (dashboard admin).
- Criterio de cierre: Cambios fuera de umbral requieren aprobacion manual y quedan logueados.

### 3. Rollback parcial y exportacion completa de historial de importaciones
- Permitir rollback configurable para importaciones parciales fallidas.
- Implementar exportacion CSV completa del historial de importaciones.
- Criterio de cierre: Operador puede revertir import parcial y exportar historial completo.

### 4. Admin: login y auditoria
- Agregar login admin y roles (admin/staff).
- Registrar acciones criticas en log de auditoria.
- Criterio de cierre: Acceso restringido y log de acciones disponible.

## Definicion de Listo (DoD)
- Todas las tareas cumplen criterios de cierre.
- Demo funcional de cada flujo en entorno local.
- Documentacion de endpoints y flujos en README.

---

## Progreso
- [ ] 1. Backfill de tcgplayerProductId por lotes
- [ ] 2. Umbrales de volatilidad y aprobacion manual
- [ ] 3. Rollback parcial y exportacion historial
- [ ] 4. Admin: login y auditoria
