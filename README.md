# TCG Singles Platform

Plataforma integral para la venta de cartas singles (Magic, Pokémon, Yu-Gi-Oh, One Piece) con precios dinámicos, inventario masivo, integración de APIs nativas y panel de administración completo.

## Estado Actual

La base activa del proyecto hoy corre con frontend en Vercel, backend en Render, caché en Upstash y base de datos PostgreSQL en Neon. El material histórico de despliegues, migraciones y workflows antiguos quedó resguardado en carpetas legacy para revisión o recuperación rápida.

## Estructura del Proyecto

```
.
├── backend/              # API REST Node.js/Express + TypeScript
│   ├── src/
│   │   ├── index.ts      # Entry point
│   │   ├── models/       # Tipos y modelos
│   │   ├── services/     # Lógica de negocio (Pricing, TCG, Cards, etc.)
│   │   ├── routes/       # Rutas API
│   │   ├── controllers/  # Controladores
│   │   ├── middleware/   # Auth, validación, etc.
│   │   └── utils/        # BD, Redis, helpers
│   ├── prisma/
│   │   └── schema.prisma # Modelo de datos
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/             # App React + Vite
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/   # Componentes reutilizables
│   │   ├── pages/        # Páginas (Catálogo, Admin, Checkout)
│   │   ├── services/     # Clientes API
│   │   ├── hooks/        # React hooks personalizados
│   │   └── types/        # Tipos TypeScript
│   ├── index.html
│   ├── package.json
│   └── tsconfig.json
│
├── .env.example          # Variables de entorno (ejemplo)
└── README.md             # Este archivo
```

## Características Principales

### 🎮 Catálogo
- Búsqueda por nombre, código y tags
- Filtrado por TCG (Magic, Pokémon, Yu-Gi-Oh, One Piece)
- Separación por edición y código de carta
- Visualización de stock disponible
- Importación masiva de sets/cartas desde APIs externas

### 💲 Precios Dinámicos
- Sincronización con APIs nativas por TCG:
  - **Magic**: Scryfall (USD)
  - **Pokémon**: Pokémon TCG API (USD)
  - **Yu-Gi-Oh**: YGOPRODeck (CardMarket, TCGPlayer, eBay, Amazon)
  - **One Piece**: OPTCGAPI (USD market/inventory)
- Conversión automática a CLP (tipo de cambio actualizado)
- Margen configurable y control de volatilidad
- Historial de cambios de precio y auditoría
- Actualización automática (cron configurable)

### 📦 Inventario

- Importación masiva por CSV/XLSX
- Edición rápida de cantidades
- Alertas de stock bajo
- Vista de inventario total y valor
- Historial de importaciones y errores

### 🛒 Checkout
- Carrito persistente por sesión
- Bloqueo de unidades para evitar sobreventa
- Generación de órdenes
- Integración de pagos (futuro)

### 👨‍💼 Panel Admin
- Dashboard con KPIs (valor total, margen, stock bajo)
- Gestión de precios, márgenes, TCGs y ediciones
- Carga de catálogo e inventario
- Auditoría de cambios y reportes

## Guía Operativa (Dashboard + Catálogo + Stock)

### Catálogo y sincronización
- Usa el panel "Catalog Sync Console" para:
  - Dry run: simula cambios antes de aplicar
  - Crear listings: activa/desactiva creación de inventario
  - Bootstrap catálogo: carga masiva inicial
  - Sync sets nuevos: detecta e importa sets nuevos

### Flujos recomendados
1. Alta de set nuevo: dry run → sync sets nuevos → revisar → ejecutar real
2. Sincronización de precios: manual o cron, revisar volatilidad
3. Restock: importar CSV/XLSX, validar y confirmar
4. Checkout: ventas descuentan stock automáticamente

### One Piece: integración completa
- Soporta search, import sets, sync automático, precios USD
- Fuente: https://www.optcgapi.com/

### Runbook rápido
- Día 0: bootstrap catálogo, revisar cobertura
- Semanal: sync sets nuevos, revisar precios/stock
- Diario: importar restock, procesar ventas

## Stack Tecnológico

### Backend
- Node.js 18+, Express.js, TypeScript
- Prisma (PostgreSQL), Redis (cache), node-cron (jobs)

### Frontend
- React 18, Vite, TypeScript
- Axios, CSS puro (opcional Tailwind/styled-components)

## Requisitos Previos

- Node.js 18.0.0 o superior
- npm o yarn
- PostgreSQL 14+
- Redis (opcional, pero recomendado para producción)

## Instalación

### 1. Clonar el repositorio

```bash
git clone <repo-url>
cd test-netdecker
```

### 2. Configurar Backend

```bash
cd backend
npm install

# Crear archivo .env basado en .env.example
cp .env.example .env

# Editar .env con tus credenciales
# DATABASE_URL=postgresql://user:password@localhost:5432/tcg_singles_db
# REDIS_URL=redis://localhost:6379

# Ejecutar migraciones
npm run prisma:push

# Inicializar datos por defecto (TCGs)
npm run prisma:seed
```

### 3. Configurar Frontend

```bash
cd ../frontend
npm install
```

## Desarrollo

### Terminal 1: Backend API

```bash
cd backend
npm run dev
```

El servidor estará disponible en `http://localhost:3333`

### Terminal 2: Frontend

```bash
cd frontend
npm run dev
```

La app estará disponible en `http://localhost:3000`

### API Base

En desarrollo, el frontend redirige automáticamente las peticiones `/api/*` a `http://localhost:3333/api/*` mediante el proxy de Vite.

### Cron Troubleshooting In Development

Si parece que la sincronización automática de precios no corre en local, revisa lo siguiente:

1. **Verifica que el backend arrancó una sola vez**
  - Si ves `EADDRINUSE` (puerto ocupado), el proceso falla antes de iniciar los cron jobs.
  - Asegúrate de no tener dos backends escuchando en el mismo puerto.

2. **Confirma que el scheduler quedó activo en logs**
  - Debes ver: `[PriceSyncJob] Scheduled with cron expression: ...`

3. **Recuerda la frecuencia configurada**
  - `PRICE_SYNC_CRON="0 */6 * * *"` ejecuta cada 6 horas, por lo que en desarrollo puede parecer que "no corre".

4. **Modo seguro para desarrollo (recomendado)**
  - `PRICE_SYNC_DEV_SAFE_MODE="true"` (por defecto en `development`) hace cron más observable:
    - `inventoryOnly=true`
    - `fetchExternalPrices=false`
  - Esto evita corridas largas por APIs externas y reduce `Previous run still in progress`.

5. **Cómo desactivar el modo seguro**
  - Si quieres comportamiento completo también en local:
    - `PRICE_SYNC_DEV_SAFE_MODE="false"`

6. **Inspección rápida de corridas**
  - Endpoint útil para diagnóstico:
    - `GET /api/listings/sync-prices/runs?limit=5`
  - Revisa `status` (`running`, `completed`, `failed`) y tiempos `startedAt/completedAt`.

## Endpoints API Base (MVP)

### TCGs
- `GET /api/tcgs` - Obtener todos los TCGs
- `GET /api/tcgs/:id` - Obtener TCG específico

### Cards
- `GET /api/cards/search?name=xxx` - Buscar cartas por nombre
- `GET /api/cards/:id` - Obtener carta específica
- `GET /api/cards/edition/:editionId` - Cartas por edición
- `GET /api/cards/tcg/:tcgId` - Cartas por TCG

### Listings (Inventario)
- `GET /api/listings/available` - Cartas disponibles (con stock)
- `GET /api/listings/low-stock` - Alertas de stock bajo
- `GET /api/listings/inventory-value` - Valor total del inventario
- `GET /api/listings/:id` - Listing específico
- `GET /api/listings/card/:cardId` - Listings de una carta

### Inventory (Gestión)
- `POST /api/inventory/update-quantity` - Actualizar cantidad
- `POST /api/inventory/bulk-update` - Carga masiva de cantidades
- `POST /api/inventory/decrease` - Reducir cantidad (compra)
- `POST /api/inventory/import-csv` - Carga masiva desde CSV (upsert catálogo + stock)
- `GET /api/inventory/import-csv/template` - Descarga plantilla CSV

### Cart (Carrito)
- `GET /api/cart/:sessionId` - Obtener carrito
- `POST /api/cart/:sessionId/add` - Agregar al carrito
- `PATCH /api/cart/:sessionId/item/:itemId` - Actualizar cantidad de item
- `DELETE /api/cart/:sessionId/item/:itemId` - Quitar item del carrito
- `POST /api/cart/:sessionId/checkout` - Finalizar compra

## Modelo de Datos

Los datos están organizados en las siguientes entidades principales:

### TCG
- Categoría de juego (Magic, Pokémon, Yu-Gi-Oh, One Piece)
- Contiene múltiples ediciones

### Edition
- Versión/set de un TCG (ej. Magic 2025, Pokémon SV05)
- Agrupa cartas de una misma colección

### Card
- Carta individual con identificador único por TCG/Edición/Código
- Metadata: nombre, rarity, tags, imagen, descripción

### Listing
- Inventario de una carta en una condición específica
- Contiene: cantidad, precio de referencia, margen, precio final en CLP

### PriceHistory
- Auditoría de cambios de precio
- Registra origen del cambio (sync, manual, etc.) y % de cambio

## Modelo de Precios

```
finalPrice (CLP) = referencePrice (USD) × marginMultiplier × exchangeRate (USD/CLP)
```

Ejemplos:
- Carta con precio TCGplayer $10 USD, margen 1.2 (20%), tasa 850 CLP/USD
  - Precio final: $10 × 1.2 × 850 = **$10.200 CLP**

## Próximos Pasos

- [x] Implementar endpoints base de checkout y órdenes
- [x] Integración de APIs nativas por TCG (Scryfall, Pokémon TCG API, YGOPRODeck, OPTCGAPI)
- [x] Job de sincronización automática de precios (cada 6 horas)
- [x] Soporte completo para One Piece
- [ ] Integración con pagos (Stripe, Mercado Pago)
- [ ] Panel admin con autenticación
- [ ] Notificaciones de cambios de precio
- [ ] Búsqueda avanzada con filtros múltiples
- [ ] Recomendaciones y trending cards
- [ ] Integración con múltiples fuentes de precio adicionales

## Variables de Entorno

Ver `.env.example` en backend/ para la lista completa.

Principales:
- `DATABASE_URL` - Conexión PostgreSQL
- `REDIS_URL` - Conexión Redis
- `PORT` - Puerto de la API (default: 3333)
- `NODE_ENV` - Entorno (development/production)
- `EXCHANGE_RATE_API_URL` - URL para obtener tasas de cambio
- `PRICE_SYNC_ENABLED` - Habilitar sync automático de precios
- `PRICE_SYNC_CRON` - Configuración de cron job para sync (ej: "0 */6 * * *" = cada 6 horas)

## Cambios Recientes (Sprint Fix — Abril 2026)

### Bugs Corregidos

1. **Yu-Gi-Oh — edición duplicada por carta**  
   `ygoCardToExternal` usaba el campo `card_sets[].set_code` (código de carta como "LOB-EN001") como código de edición, creando una edición diferente por cada carta.  
   Ahora se extrae el prefijo de set ("LOB") y cuando hay `setFilter` se usa siempre como código autoritativo.

2. **Precio CLP incorrecto en listings creados por importación**  
   El `ExternalImportService` creaba listings con `exchangeRate: 1.0`, resultando en precios CLP equivalentes a USD.  
   Ahora se obtiene la tasa real USD→CLP al crear/actualizar cada listing.

3. **Página `/importar` mostraba nada en tab "CSV Stock"**  
   El componente `ImportPage` trataba la respuesta paginada `{ items, total, page }` como un array directamente.  
   Ahora extrae correctamente `items` del objeto de respuesta.

4. **Resultado de validación CSV no se mostraba**  
   La validación mapeaba mal la respuesta del backend `{ result: { total, success, failed, errors } }` al formato esperado `{ valid, errors, totalRows }`.  
   Ahora extrae y mapea correctamente los campos.

5. **Dashboard mostraba alertas de stock bajo/sin stock para cartas nunca compradas**  
   Las alertas de stock ahora solo aplican a listings con `everHadStock: true` (campo nuevo en Listing).  
   El campo se pone a `true` automáticamente cuando la cantidad supera 0 por primera vez.

### Nuevas Funcionalidades

- **Ver imagen de carta**: Hacer clic en el nombre de cualquier carta en el inventario muestra su imagen en un modal.
- **Reset de catálogo**: Botón "Resetear Catálogo" en la pestaña CSV Stock (Zona de Peligro) que borra todos los datos de catálogo preservando TCGs y tipo de cambio.
  - También disponible vía API: `POST /api/admin/catalog/reset` con `{ confirm: true }`
  - Y como script de consola: `cd backend && npm run catalog:reset` (requiere `--confirm`)

### Migraciones de Base de Datos

Después de hacer pull de este branch, ejecutar:
```bash
cd backend
npm run prisma:push   # Aplica el nuevo campo everHadStock a la tabla Listing
```

### Pendiente (siguiente iteración)

- Agregar buscador de cartas con autocompletar por TCG dentro del Inventario
- Mejorar UI de precio (mostrar USD y CLP en la misma tabla con el tipo de cambio actual)
- Auto-actualización de sets YGO y One Piece sin importación manual
- Autenticación admin básica
- Confirmación visual al actualizar precios masivamente



## Despliegue en Cloudflare Pages + D1

Para una guía completa ver [DEPLOYMENT_CLOUDFLARE.md](DEPLOYMENT_CLOUDFLARE.md).

Resumen rápido:

- Build command (Pages): `npm run build` (raíz del repo). Esto genera `frontend/dist`.
- Output directory: `frontend/dist`.
- Crear D1 DB y añadir binding `TCG_D1` en Pages/Wrangler.
- Si trabajas en Windows y tienes problemas con `prisma generate`, revisa `backend/PRISMA_WINDOWS.md`.

## Licencia

MIT

## Soporte

Para reportar bugs o solicitar features, abrir un Issue.

---

**Versión**: 0.1.0 (MVP - En desarrollo)
