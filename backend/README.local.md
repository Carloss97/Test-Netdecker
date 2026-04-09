# Desarrollo local con SQLite

Guía rápida para ejecutar el backend localmente usando SQLite (sin Postgres).

1. Copia el ejemplo de entorno:

   cp backend/.env.example backend/.env

2. En `backend/.env` habilita SQLite y establece la URL de archivo:

   USE_SQLITE="true"
   DATABASE_URL="file:./dev.sqlite"

3. Genera el cliente Prisma para SQLite:

   npm --prefix backend run prisma:generate:sqlite

4. (Opcional) Empuja el esquema al archivo SQLite:

   npm --prefix backend run prisma:push:sqlite

5. Arranca en modo desarrollo usando el script conveniente:

   npm --prefix backend run dev:sqlite

6. Para construir y ejecutar la versión compilada:

   npm --prefix backend run build
   npm --prefix backend run start:sqlite

Esto permite desarrollar y ejecutar la app sin depender de una instancia Postgres local.
