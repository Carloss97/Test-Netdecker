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
- Sincronización con TCGplayer (referencia principal)
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

El servidor estará disponible en `http://localhost:3001`

### Terminal 2: Frontend

```bash
cd frontend
npm run dev
```

La app estará disponible en `http://localhost:3000`

### API Base

En desarrollo, el frontend redirige automáticamente las peticiones `/api/*` a `http://localhost:3001/api/*` mediante el proxy de Vite.

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
- [ ] Integración con pagos (Stripe, Mercado Pago)
- [ ] Job de sincronización automática de precios (cada 4-6 horas)
- [ ] Panel admin con autenticación
- [ ] Importación de catálogo desde TCGplayer/CSV
- [ ] Notificaciones de cambios de precio
- [ ] Búsqueda avanzada con filtros múltiples
- [ ] Recomendaciones y trending cards
- [ ] Integración con múltiples fuentes de precio

## Variables de Entorno

Ver `.env.example` en backend/ para la lista completa.

Principales:
- `DATABASE_URL` - Conexión PostgreSQL
- `REDIS_URL` - Conexión Redis
- `PORT` - Puerto de la API (default: 3001)
- `TCGPLAYER_API_KEY` - API Key de TCGplayer (opcional)
- `EXCHANGE_RATE_API_URL` - URL para obtener tasas de cambio

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
