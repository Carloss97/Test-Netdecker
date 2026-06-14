# NetDeckER Product and Domain Specification

> **Para Hermes:** este documento define qué construir. No implementes desde memoria; usa esta especificación como contrato funcional.

## 1. Resumen ejecutivo

NetDeckER es una plataforma multitenant para tiendas de cartas coleccionables que venden singles de TCGs. El producto combina:

- catálogo técnico de cartas desde TCGCSV,
- inventario por tienda,
- cálculo de precios en CLP basado en referencias USD,
- importación/exportación de stock,
- POS físico,
- storefront público,
- administración de pedidos,
- dashboard operativo,
- trazabilidad/auditoría.

El objetivo del reinicio es construir una base limpia, mantenible y local-first que permita a una tienda TCG operar su inventario y ventas sin depender de APIs pagadas o credenciales externas durante el MVP.

## 2. Clientes y usuarios

### 2.1 Cliente comprador del SaaS/producto

**Dueño o administrador de una tienda TCG local**, especialmente tiendas pequeñas/medianas que:

- manejan inventario grande de cartas singles,
- reciben restocks por CSV/Excel o ingreso manual,
- venden presencialmente y potencialmente online,
- necesitan precios en CLP derivados de referencias USD,
- quieren importar catálogos por set desde TCGCSV,
- no quieren contratar integraciones complejas al inicio.

### 2.2 Usuarios internos

#### Dueño / administrador de tienda

Responsabilidades:

- configurar tienda, margen, tasa USD→CLP y umbrales,
- importar sets y stock,
- revisar dashboard operativo,
- aprobar o rechazar cambios de precio significativos,
- revisar ventas y reportes,
- administrar usuarios internos.

Necesita:

- máxima visibilidad de inventario y dinero,
- señales accionables: bajo stock, sin precio, precios stale, errores de sync,
- operaciones seguras: rollback, auditoría, no mezcla entre tiendas.

#### Encargado de inventario

Responsabilidades:

- importar o ajustar stock,
- revisar stock bajo,
- exportar inventario,
- corregir cartas sin precio o mal mapeadas.

Necesita:

- flujos rápidos de importación,
- validación previa de CSV,
- errores por fila,
- historial de importaciones,
- herramientas de búsqueda por set/código/nombre.

#### Vendedor POS

Responsabilidades:

- buscar cartas,
- agregar al carrito POS,
- cobrar efectivo/tarjeta externa,
- cerrar sesión de caja,
- emitir comprobante/recibo.

Necesita:

- interfaz rápida, teclado-friendly,
- stock confiable,
- no oversell,
- ventas con trazabilidad.

### 2.3 Usuarios externos

#### Cliente final / comprador online

Responsabilidades:

- navegar catálogo público,
- filtrar por TCG/set/búsqueda,
- agregar al carrito,
- registrarse/loguearse opcionalmente,
- hacer pedido.

Necesita:

- catálogo rápido,
- precios claros en CLP,
- stock real,
- checkout simple.

### 2.4 Operador SaaS / superadmin futuro

Responsabilidades:

- crear tiendas,
- revisar health global,
- rotar API keys,
- investigar webhooks/errores,
- administrar planes futuros.

Necesita:

- consola multitenant,
- aislamiento fuerte,
- diagnósticos por tienda.

## 3. Juegos soportados en MVP

El MVP debe soportar estos TCGs mediante TCGCSV:

| TCG | ID interno | TCGCSV/TCGplayer categoryId | Notas |
|---|---:|---:|---|
| Magic: The Gathering | `MAGIC` | `1` | Mayor volumen; sets con códigos/abbrev. |
| Yu-Gi-Oh! | `YUGIOH` | `2` | Códigos públicos duplicados; preservar `groupId`. |
| Pokémon | `POKEMON` | `3` | Códigos pueden requerir normalización de casing. |
| Weiss Schwarz | `WEISS_SCHWARZ` | `20` | Category ID actual usado por TCGCSV. |
| Digimon Card Game | `DIGIMON` | `63` | Catálogo TCGCSV-only. |
| One Piece TCG | `ONE_PIECE` | `68` | Catálogo TCGCSV-only. |

Regla clave: **mostrar al usuario códigos públicos/legibles, pero persistir identificadores externos suficientes para resolver grupos duplicados**.

## 4. Propuesta de valor

1. **Local-first:** la tienda puede probar y operar el MVP sin Neon, Redis, Stripe, MercadoPago ni APIs externas adicionales.
2. **TCGCSV-first:** acceso amplio a catálogo/precios sin OAuth oficial de TCGplayer.
3. **Multi-tenant desde día 1:** cada tienda tiene catálogo operativo, inventario, pedidos, POS y precios aislados.
4. **Precios dinámicos explicables:** referencia USD + tasa USD→CLP + margen + redondeo = precio final CLP.
5. **Operaciones auditables:** importaciones, ajustes, ventas, movimientos y cambios de precio trazables.
6. **Dashboard accionable:** score de salud, stock bajo, out-of-stock, precios faltantes/stale, errores de sync.

## 5. Módulos funcionales

### 5.1 Catálogo externo TCGCSV

Funcionalidades:

- listar TCGs soportados,
- listar sets por TCG,
- buscar cartas por nombre,
- buscar cartas por código/productId,
- importar set completo,
- importar carta individual,
- importar resultados de búsqueda,
- preservar metadatos: `productId`, `groupId`, `editionCode`, `editionName`, `cardNumber`, `rarity`, `imageUrl`, `cardType`, `attribute`, `metadata`, precios.

Reglas:

- TCGCSV es la única fuente remota del MVP.
- Los endpoints legacy estilo YGOPRODeck pueden existir solo como compatibilidad interna, mapeados desde TCGCSV, jamás proxyeando YGOPRODeck.
- `groupId` es obligatorio internamente para importar sets cuando TCGCSV lo entrega.
- Si un set no tiene `groupId`, se usa `code` como fallback.

### 5.2 Catálogo local

Entidades locales:

- TCG,
- Edition,
- Card.

Funciones:

- mantener sets importados,
- activar/desactivar TCGs y ediciones,
- buscar cartas locales,
- consultar cartas por edición con stock,
- generar templates CSV por edición.

Diferencia conceptual:

- **Catálogo externo:** lo que existe en TCGCSV.
- **Catálogo local:** lo que la tienda decidió importar y operar.

### 5.3 Listings e inventario

Un `Listing` representa una carta vendible bajo:

- tienda (`storeId`),
- carta (`cardId`),
- condición (`NM`, `LP`, `MP`, `HP`, `DMG`),
- rareza/variant si aplica,
- precio final,
- stock disponible.

Funciones:

- listar disponibles,
- listar stock bajo,
- actualizar stock,
- bulk update,
- disminuir stock por venta,
- importar CSV,
- rollback de importación,
- exportar CSV reimportable.

Reglas:

- stock no puede quedar negativo por ventas,
- todo cambio de stock crea `StockMovement`,
- importación masiva debe ser idempotente por clave natural,
- toda importación debe producir historial y detalle de errores.

### 5.4 Precios

Modelo de precio:

```text
referencePriceUSD * usdToClpRate * marginMultiplier => roundedFinalPriceCLP
```

Campos clave:

- `referencePrice` en USD,
- `exchangeRate` USD→CLP,
- `marginMultiplier`,
- `roundingMultiple`,
- `finalPrice` en CLP,
- `pricingSource`: `tcgcsv`, `manual`, `stored`, `fallback`.

Funciones:

- preview de precio,
- sync manual por tienda,
- sync por set/TCG,
- historial de cambios,
- umbrales de volatilidad,
- flujo de aprobación opcional.

Reglas:

- La tasa de cambio local es manual/configurable (`MANUAL_USD_TO_CLP`), no API externa.
- El dashboard no debe llamar APIs externas para tasas de cambio.
- Un precio fallback debe quedar marcado como fallback para revisión.

### 5.5 Importación y exportación

Flujos:

1. Importar catálogo desde TCGCSV por set.
2. Crear listings con stock inicial `0` o configurable.
3. Importar stock desde CSV de proveedor/tienda.
4. Validar CSV antes de aplicar.
5. Confirmar importación.
6. Ver historial y errores.
7. Rollback de importación.
8. Exportar inventario completo, por TCG o por edición.

CSV mínimo reimportable:

```csv
tcg,editionCode,cardCode,cardName,condition,quantity,referencePrice,marginMultiplier
YUGIOH,SRL-EN,12345,Blue-Eyes White Dragon,NM,2,10.50,1.35
```

Recomendación para nuevo proyecto:

- Crear un módulo `ImportPipeline` con etapas explícitas: parse → normalize → validate → dry-run → apply → audit.
- No mezclar parsing CSV con writes DB dentro de una función gigante.

### 5.6 POS y ventas presenciales

Funciones:

- abrir sesión POS,
- buscar listing,
- agregar ítems,
- calcular total,
- registrar pago local (`CASH`, `CARD_MANUAL`, `TRANSFER`),
- descontar stock atómicamente,
- crear orden,
- cerrar sesión/caja.

Reglas:

- POS no debe depender de Stripe/MercadoPago en MVP local.
- Los pagos externos pueden quedar como adaptadores futuros deshabilitados.
- Cada venta debe crear `Order`, `OrderItem`, `StockMovement`, opcional `PaymentTransaction`.

### 5.7 Storefront público

Funciones:

- catálogo público por tienda/slug,
- filtros por TCG, set, nombre,
- detalle producto,
- carrito persistente,
- checkout con pedido,
- autenticación cliente opcional,
- wishlist/reviews opcionales en fases futuras.

Reglas:

- solo mostrar listings activos y con stock,
- el stock mostrado debe ser store-scoped,
- checkout debe reservar/descontar stock con protección de concurrencia.

### 5.8 Pedidos, comprobantes y facturación interna

Funciones:

- listar pedidos,
- ver detalle,
- cambiar estado fulfillment,
- cancelar pedido,
- generar recibo/PDF,
- generar factura/boleta interna local.

Fases futuras pueden integrar boleta fiscal real; el MVP solo requiere documento interno trazable.

### 5.9 Dashboard y analytics

KPIs mínimos:

- total cartas local,
- total listings,
- listings activos,
- stock bajo,
- out-of-stock,
- valor inventario CLP (`finalPrice * quantity`), no suma simple de precios,
- ventas totales,
- margen bruto,
- ventas por TCG,
- precios stale,
- precios faltantes,
- últimos errores de sync/import.

Regla crítica aprendida:

- Dashboard debe cargar sin 500 aunque DB esté vacía.
- SQLite local puede omitir modelos producción; servicios deben degradar a cero/arrays vacíos.

### 5.10 Multi-tenant y administración

Funciones:

- crear tienda,
- seleccionar tienda activa,
- API key por tienda,
- admin global vs admin scoped,
- auditoría por acción,
- consola de diagnóstico de visibilidad.

Reglas:

- Todos los queries de negocio deben tener `storeId` cuando aplica.
- Rutas admin que no reciben tienda explícita usan sesión/header/tenant resolver.
- Un admin scoped nunca puede elegir otra tienda por header.

## 6. Alcance MVP inicial

### Debe incluir

- Auth admin local/dev.
- Una tienda local default.
- TCGs base seeded.
- TCGCSV sets/cards/prices.
- Importar un set.
- Crear listings.
- Inventario/listings.
- CSV import/export.
- Dashboard operativo.
- POS básico local.
- Orders básicos.
- Storefront público simple.

### Puede esperar

- Stripe/MercadoPago reales.
- Webhooks externos.
- Facturación fiscal real.
- Accounting completo doble partida.
- Reviews/wishlist avanzados.
- Multi-store SaaS billing.
- Deploy multiambiente complejo.

## 7. Métricas de éxito del producto

1. Una tienda puede inicializarse en menos de 5 minutos localmente.
2. Puede importar un set TCGCSV y ver cartas/listings en UI.
3. Puede ajustar stock y exportar CSV.
4. Puede vender por POS sin stock negativo.
5. Puede ver dashboard de salud sin errores con DB vacía o poblada.
6. Puede operar sin credenciales externas excepto red hacia TCGCSV.
7. Un nuevo desarrollador/agente puede ejecutar tests/build/smoke sin contexto previo.
