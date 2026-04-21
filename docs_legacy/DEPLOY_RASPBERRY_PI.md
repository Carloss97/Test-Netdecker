git clone https://github.com/Carloss97/Test-Netdecker.git
pm2 start backend/dist/index.js --name netdecker-backend
# Despliegue paso a paso en Raspberry Pi 4 (4GB)

> Esta guía asume que tienes Raspberry Pi OS instalado, conexión a internet y acceso SSH.

---

## 1. Actualiza el sistema

```sh
sudo apt update && sudo apt upgrade -y
```

---

## 2. Instala dependencias básicas

**Git:**
```sh
sudo apt install git
```

**Node.js y npm (LTS):**
```sh
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

**SQLite (fácil para pruebas):**
```sh
sudo apt install sqlite3
```

**Opcional: PostgreSQL, MariaDB o Redis**
```sh
# PostgreSQL
sudo apt install postgresql
# MariaDB
sudo apt install mariadb-server
# Redis
sudo apt install redis-server
```

---

## 3. Clona el repositorio y prepara la app

```sh
cd ~
git clone https://github.com/Carloss97/Test-Netdecker.git
cd Test-Netdecker
```

---

## 4. Configura variables de entorno

```sh
cp backend/.env.example backend/.env
# Edita backend/.env con nano o vim y pon los valores correctos (DATABASE_URL, REDIS_URL, PORT, etc)
nano backend/.env
```

---

## 5. Instala dependencias del proyecto

```sh
npm install
npm --prefix backend install
npm --prefix frontend install
```

---

## 6. Construye el frontend

```sh
npm --prefix frontend run build
```

---

## 7. Prepara la base de datos

Si usas SQLite, ya está listo. Si usas PostgreSQL/MariaDB, crea la base y usuario, y actualiza `DATABASE_URL` en `.env`.

---

## 8. Migra y seedéa la base de datos

```sh
npm --prefix backend run prisma:push
npm --prefix backend run prisma:seed
```

---

## 9. Instala pm2 y levanta el backend

```sh
sudo npm install -g pm2
npm run build
npm --prefix backend run build
npm --prefix frontend run build
pm2 start backend/dist/index.js --name netdecker-backend
```

**Ejemplo opcional de archivo pm2:**

`ecosystem.config.js` en la raíz:
```js
module.exports = {
  apps: [
    {
      name: 'netdecker-backend',
      script: './backend/dist/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 3001 // o el puerto que uses
      }
    }
  ]
};
```
Lanza con:
```sh
pm2 start ecosystem.config.js
```

---

## 10. Instala y configura Nginx para servir el frontend

```sh
sudo apt install nginx
```

**Ejemplo de configuración:**

Archivo `/etc/nginx/sites-available/netdecker`:
```
server {
    listen 80;
    server_name TU_DOMINIO_O_IP_LOCAL;

    root /home/pi/Test-Netdecker/frontend/dist;
    index index.html;

    location /api/ {
        proxy_pass http://localhost:3001/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Activa el sitio y reinicia Nginx:
```sh
sudo ln -s /etc/nginx/sites-available/netdecker /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## 11. (Opcional) HTTPS con Certbot

```sh
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx
```

---

## 12. Seguridad y mantenimiento

- Cambia contraseñas por defecto.
- Usa firewall (`sudo apt install ufw`).
- Haz backups regulares de la base de datos.
- Monitorea recursos con `htop` o `vcgencmd measure_temp`.

---

## 13. Acceso externo

- Si quieres acceso desde fuera de tu red local, abre puertos en tu router y considera usar DuckDNS o No-IP para dominio dinámico.

---

**¡Listo! Así puedes tener tu app corriendo en una Raspberry Pi 4 desde cero.**

---

## Tips, problemas comunes y recomendaciones extra

- **Espacio en disco:** Verifica con `df -h` que tienes suficiente espacio, especialmente en `/home/pi` y `/var`.
- **Temperatura:** La Raspberry Pi puede calentarse bajo carga. Monitorea con `vcgencmd measure_temp` y considera disipador o ventilador si supera los 70°C.
- **Swap:** Si tienes errores de memoria en builds grandes, puedes aumentar el swap temporalmente:
  ```sh
  sudo dphys-swapfile swapoff
  sudo sed -i 's/^CONF_SWAPSIZE=.*/CONF_SWAPSIZE=2048/' /etc/dphys-swapfile
  sudo dphys-swapfile setup
  sudo dphys-swapfile swapon
  ```
- **Permisos:** Si tienes errores de permisos, revisa que el usuario tenga acceso a las carpetas del proyecto y a los puertos usados.
- **Prisma y SQLite:** Para pruebas, SQLite es suficiente y no requiere configuración extra. Para producción, considera PostgreSQL o MariaDB.
- **Respaldo de base de datos:** Haz copias de seguridad periódicas de tu archivo `.db` (SQLite) o usa `pg_dump`/`mysqldump` para PostgreSQL/MariaDB.
- **Logs:** Puedes ver logs de pm2 con `pm2 logs` y de Nginx en `/var/log/nginx/`.
- **Arranque automático:** Para que pm2 restaure los procesos tras reinicio:
  ```sh
  pm2 startup
  pm2 save
  ```
- **Firewall:** Activa UFW y permite solo los puertos necesarios:
  ```sh
  sudo ufw allow OpenSSH
  sudo ufw allow 'Nginx Full'
  sudo ufw enable
  ```
- **Actualizaciones:** Mantén el sistema y dependencias actualizadas, pero prueba primero en desarrollo antes de actualizar en producción.
- **Usuarios y seguridad:** No uses el usuario `pi` para exponer servicios críticos. Crea un usuario nuevo con permisos limitados si es posible.
- **Dominio dinámico:** Si tu IP es dinámica, usa DuckDNS, No-IP o similar para tener un subdominio siempre actualizado.
- **Pruebas externas:** Prueba el acceso desde fuera de tu red local (por ejemplo, usando datos móviles) para validar la apertura de puertos y el dominio.
- **Documenta cambios:** Lleva registro de cambios en `.env`, configuraciones y scripts personalizados.

---

¿Necesitas ayuda con algún paso específico o tienes un error concreto? ¡Describe el problema y te ayudo a resolverlo!