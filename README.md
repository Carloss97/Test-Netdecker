# TCG Singles Platform

Plataforma completa para la venta de cartas singles (Magic, Pokémon, Yu-Gi-Oh, One Piece) con precios dinámicos actualizados según referencias de mercado, conversión a CLP, gestión de inventario y checkout integrado.

## Estructura del Proyecto

```
.
├── backend/              # API REST Node.js/Express con TypeScript
│   ├── src/
│   │   ├── index.ts      # Entry point
│   │   ├── models/       # Tipos TypeScript
│   │   ├── services/     # Lógica de negocio (Pricing, TCG, Cards, etc.)
│   │   ├── routes/       # Rutas API
│   │   ├── controllers/  # Controladores (a desarrollar)
│   │   ├── middleware/   # Middleware auth, validación, etc.
│   │   └── utils/        # Utilidades (BD, Redis, helpers)
│   ├── prisma/
│   │   └── schema.prisma # Modelo de datos
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/             # Aplicación React con Vite
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

### 💲 Precios Dinámicos
- Sincronización con múltiples APIs nativas por TCG:
  - **Magic**: Scryfall (datos + precios USD)
  - **Pokémon**: Pokémon TCG API (datos + precios USD)
  - **Yu-Gi-Oh**: YGOPRODeck (datos + precios multi-fuente: CardMarket, TCGPlayer, eBay, Amazon)
  - **One Piece**: OPTCGAPI (datos + precios USD market/inventory)
- Conversión automática a CLP usando tasa USD actual
- Cálculo de margen dinámico por demanda/volatilidad
- Actualización automática con límites de seguridad
- Historial de cambios de precio para auditoría

### 📦 Inventario
- Carga masiva por CSV/XLSX
- Edición rápida de cantidades (sin inventario manual card-by-card)
- Alertas de stock bajo
- Vista de inventario total y valor

### 🛒 Checkout
- Carrito persistente por sesión
- Bloqueo de unidades para evitar sobreventa
- Generación de órdenes
- Integración de pagos (futuro)

### 👨‍💼 Panel Admin
- Dashboard con KPIs (valor total, margen, stock bajo)
- Gestión de precios y márgenes
- Gestión de TCGs y ediciones
- Carga de catálogo e inventario
- Auditoría de cambios

## Guía Operativa (Dashboard + Catálogo + Stock)

Esta sección explica en lenguaje operativo qué hace cada acción del panel y cómo usar el flujo completo en tienda.

### 1) Qué significa cada botón en "Catalog Sync Console"

- Dry run:
  - Ejecuta el proceso en modo simulación para revisar métricas y validaciones antes de una corrida operativa.
  - Recomendación: úsalo siempre primero en ambiente de prueba o en una corrida controlada.

- Crear listings:
  - Si está activado, además de crear/actualizar cartas en catálogo, también crea o actualiza listings de inventario.
  - Si está desactivado, solo actualiza catálogo (TCG, edición, carta, metadata), sin tocar inventario/listings.

- Bootstrap catálogo:
  - Carga masiva inicial del catálogo histórico.
  - Se usa cuando partes desde cero o cuando quieres poblar una gran porción del catálogo de una vez.
  - Puede correrse por TCG específico o con filtros de set/límite.

- Sync sets nuevos:
  - Busca sets nuevos (o cambios detectados) en fuentes externas y los incorpora al catálogo local.
  - Está pensado para operación continua después del bootstrap inicial.
  - También puede ejecutarse por TCG para mantener un juego puntual.

### 2) Flujo recomendado de operación

#### Fase A: Alta de set nuevo (catálogo)

1. Ir a Dashboard > Catalog Sync Console.
2. Elegir TCG (o dejar All TCGs).
3. Activar Dry run y ejecutar Sync sets nuevos.
4. Revisar resultado JSON (sets detectados, creados, actualizados, omitidos).
5. Si todo está OK, desactivar Dry run y volver a ejecutar.
6. Si necesitas carga histórica completa, ejecutar Bootstrap catálogo (idealmente por lotes).

Resultado esperado:
- El set queda disponible en catálogo local.
- Las cartas nuevas del set quedan creadas/actualizadas.
- Si Crear listings está activo, quedan listings operativos para ese set.

#### Fase B: Ajustar/sincronizar precios

1. Verificar cobertura en Dashboard (TCGplayer Coverage).
2. Ejecutar sincronización de precios (manual o cron).
3. Revisar volatilidad en Dashboard para detectar saltos sospechosos.
4. Si hay cambios extremos, aplicar revisión manual antes de publicar.

Regla general del motor:
- Precio final CLP = precio referencia USD x margen x tipo de cambio.
- Prioridad de precio: API nativa del TCG (Scryfall, Pokémon TCG API, YGOPRODeck, OPTCGAPI)

#### Fase C: Actualizar stock (restock y ventas)

1. Restock masivo:
   - Ir a Admin Importaciones y subir CSV/XLSX.
   - Prevalidar.
   - Confirmar importación.
2. Venta/checkout:
   - El flujo de carrito/checkout descuenta stock del listing.
3. Ajustes puntuales:
   - Usar endpoints de inventory o edición operacional en panel para correcciones.

Buenas prácticas:
- Mantener "catálogo y precio" automatizado.
- Mantener "stock" como proceso controlado por operación (importaciones y ventas).

### 3) One Piece: estado actual e integración completa

Estado actual:
- ✅ One Piece está completamente integrado end-to-end
- Soporta todos los flujos: search, import sets, sync automático, precios en USD

Cómo funciona operativamente:
- Igual que Magic, Pokémon y Yu-Gi-Oh:
  1. Detectar set nuevo en Sync sets nuevos
  2. Importar cartas del set desde OPTCGAPI
  3. Crear listings (opcional) con margen inicial
  4. Sincronizar precios automáticamente (cron job cada 6 horas)
  5. Mantener stock por restock (CSV/XLSX) y ventas (checkout)

Fuente de datos:
- API: https://www.optcgapi.com/ (comunitaria, sin autenticación)
- Proporciona: card names, set codes, rarities, market prices USD, inventory prices USD
- Tasa de actualización: aproximadamente cada 2 semanas

### 4) Runbook rápido para tienda (resumen)

- Día 0 (arranque):
  - Bootstrap catálogo por lotes.
  - Revisar cobertura de productId/precios.

- Operación semanal:
  - Sync sets nuevos.
  - Revisar volatilidad y low stock.

- Operación diaria:
  - Importar restock.
  - Procesar ventas (checkout descuenta stock).
  - Revisar errores de importación y corregir archivo fuente.

- Antes de cambios grandes:
  - Ejecutar Dry run.
  - Validar resultados.
  - Ejecutar corrida real.

## Stack Tecnológico

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Language**: TypeScript
- **ORM**: Prisma
- **Database**: PostgreSQL
- **Cache**: Redis
- **Task Queue**: node-cron (jobs programados)

### Frontend
- **Framework**: React 18
- **Build Tool**: Vite
- **Language**: TypeScript
- **HTTP Client**: Axios
- **Styling**: CSS puro (extendible con Tailwind/styled-components)

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

## Contribución

1. Crear una rama: `git checkout -b feature/nueva-feature`
2. Commit: `git commit -am 'Add feature'`
3. Push: `git push origin feature/nueva-feature`
4. Abrir Pull Request

## Licencia

MIT

## Soporte

Para reportar bugs o solicitar features, abrir un Issue.

---

**Versión**: 0.1.0 (MVP - En desarrollo)
