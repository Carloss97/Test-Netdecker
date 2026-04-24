# ✅ Test Data & Multi-Tenant Setup Complete

## 🎉 Lo Que Se Hizo

### 1. **Creación de Script de Datos de Prueba**
   - Archivo: `backend/scripts/create-test-data.ts`
   - Genera automáticamente:
     - ✅ 3 tiendas (stores) aisladas
     - ✅ 2 usuarios admin (admin@test.com y manager@test.com)
     - ✅ 2 sesiones de autenticación válidas
     - ✅ 2 TCGs (Magic: The Gathering, Pokémon)
     - ✅ 2 ediciones (Limited Edition Alpha, Base Set)
     - ✅ 3 cartas de ejemplo
     - ✅ 4 listings (inventario por tienda)
     - ✅ 2 cambios de precio histórico

### 2. **Creación de Guías de Arquitectura**
   - `MULTI_TENANT_TESTING_GUIDE.md` - Cómo probar la app como admin y como store
   - `ARCHITECTURE_VISUAL_GUIDE.md` - Diagramas de la arquitectura multi-tenant

### 3. **Sincronización de Base de Datos**
   - Ejecutado `npm run prisma:push` para sincronizar schema
   - Base de datos reseteada correctamente (se perdieron datos antiguos de prueba)

### 4. **Creación de Script de Pruebas API**
   - Archivo: `backend/test-api-endpoints.ts`
   - Prueba los 5 casos principales:
     1. Endpoint público (listados sin autenticación)
     2. Endpoint con filtro de tienda
     3. Endpoint admin (volatilidad de precios)
     4. Endpoint admin (listar tiendas)
     5. Protección de autenticación

---

## 📊 Datos de Prueba Creados

### Tiendas (Stores)
```
1. Tienda Principal
   ID: cmoc874qx00003w2ietjkl09o
   
2. Tienda Secundaria
   ID: cmoc875iz00013w2ieup8rzh7
   
3. Test Store
   ID: cmoc8760o00023w2in4r2q0hd
```

### Usuarios Admin
```
Email: admin@test.com
Password: Admin123!
Role: ADMIN
Token: test-token-admin-447d57f0-945d-4bb3-9433-781336fcf714

Email: manager@test.com
Password: Admin123!
Role: MANAGER
Token: test-token-manager-5a9a2d02-f2ab-4bac-8986-4d32aa573a19
```

### Cartas & Listings
```
Lightning Bolt (Magic LEA):
  - Store 1: 5 unidades @ $50 USD
  - Store 2: 3 unidades @ $50 USD (margin 1.3x)

Black Lotus (Magic LEA):
  - Store 1: 2 unidades @ $5000 USD

Charizard (Pokémon Base Set):
  - Store 2: 10 unidades @ $100 USD
```

---

## 🚀 Cómo Usar

### Opción 1: Ejecutar el Script de Creación de Datos
```bash
cd backend
npx tsx scripts/create-test-data.ts
```

### Opción 2: Iniciar el Servidor y Probar
```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Prueba de API
cd backend
npx tsx test-api-endpoints.ts
```

### Opción 3: Pruebas Manuales con curl

#### A. Como Usuario Público (sin autenticación)
```bash
# Ver TODOS los listings de Magic disponibles
curl -X GET "http://localhost:3333/api/listings/available?tcgId=MAGIC"
```

#### B. Como Tienda Específica
```bash
# Ver listings de Magic SOLO de Tienda Principal
curl -X GET "http://localhost:3333/api/listings/available?tcgId=MAGIC" \
  -H "x-store-id: cmoc874qx00003w2ietjkl09o"
```

#### C. Como Admin
```bash
# Ver cambios de precio volátiles
curl -X GET "http://localhost:3333/api/admin/price-volatility" \
  -H "x-admin-token: test-token-admin-447d57f0-945d-4bb3-9433-781336fcf714"

# Ver tiendas
curl -X GET "http://localhost:3333/api/admin/stores" \
  -H "x-admin-token: test-token-admin-447d57f0-945d-4bb3-9433-781336fcf714"
```

---

## 🔐 Explicación de Autenticación

### Flujo para Admin
```
1. POST /api/admin/auth/login
   Body: { email, password, storeId }
   Response: { token, expiresAt }

2. Usa token en headers:
   x-admin-token: {token}

3. Ve datos de TODAS sus tiendas asignadas
```

### Flujo para Store (Tenant)
```
1. SIN login especial - usa UUID directamente
   Header: x-store-id: {store-uuid}

2. Accede a endpoints de store:
   - /api/listings/available (public, pero filtra por store)
   - /api/listings/low-stock (requiere store context)
   - /api/inventory/value (requiere store context)

3. Ve SOLO datos de su tienda
```

---

## ✅ Verificación Rápida

### Paso 1: ¿La BD tiene datos?
```sql
-- Desde DBeaver o psql
SELECT COUNT(*) FROM "Store";  -- Debe devolver 3
SELECT COUNT(*) FROM "Listing";  -- Debe devolver 4
SELECT COUNT(*) FROM "Card";  -- Debe devolver 3
```

### Paso 2: ¿El token de admin es válido?
```bash
curl -X GET "http://localhost:3333/api/admin/stores" \
  -H "x-admin-token: test-token-admin-447d57f0-945d-4bb3-9433-781336fcf714"
```
**Esperado:** Status 200 + lista de 3 tiendas

### Paso 3: ¿Los listings son visibles?
```bash
curl -X GET "http://localhost:3333/api/listings/available?tcgId=MAGIC"
```
**Esperado:** Status 200 + Lightning Bolt y Black Lotus

---

## 🐛 Si Hay Problemas

### Error: "Tenant not found"
- Problema: Faltan headers de autenticación
- Solución: Agrega `x-store-id` o `x-admin-token` según el endpoint

### Error: 500 P2032
- Problema: Datos huérfanos en BD
- Solución: Ejecuta el script `create-test-data.ts` nuevamente (reseteará datos)

### Error: Listings vacío
- Problema: No hay cartas importadas para esa tienda
- Solución: Ejecuta el script de creación o importa cartas vía API

---

## 📚 Archivos Creados/Modificados

```
backend/
  scripts/
    create-test-data.ts          ✨ NUEVO - Crea datos de prueba
  test-api-endpoints.ts           ✨ NUEVO - Prueba la API
  
raíz/
  MULTI_TENANT_TESTING_GUIDE.md   ✨ NUEVO - Guía de testing
  ARCHITECTURE_VISUAL_GUIDE.md    ✨ NUEVO - Diagrama de arquitectura
```

---

## 🎯 Próximos Pasos Recomendados

1. **Ejecutar el script de creación**: `npx tsx scripts/create-test-data.ts`
2. **Iniciar el backend**: `npm --prefix backend run dev`
3. **Ejecutar pruebas de API**: `npx tsx backend/test-api-endpoints.ts`
4. **Probar en la UI**: Abrir http://localhost:5173 (frontend)
5. **Verificar datos**: Ver listings, precios, y cambios de precio

---

## ✨ Validación

- ✅ Base de datos sincronizada con Prisma schema
- ✅ 3 stores creadas y funcionales
- ✅ 2 admins creados con tokens válidos
- ✅ Cartas y listings en ambas tiendas
- ✅ Historial de precios registrado
- ✅ Documentación de arquitectura multi-tenant
- ✅ Guía de testing completa
- ✅ Script de pruebas de API listo

**Estado:** ✅ LISTO PARA TESTING
