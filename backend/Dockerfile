FROM node:20 AS builder
WORKDIR /usr/src/app

# Install dependencies and build
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci

# Copy backend source
COPY backend/ .

RUN npm run prisma:generate
RUN npm run prisma:generate:sqlite
RUN npm run build

FROM node:20 AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY --from=builder /usr/src/app/package.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3333
CMD ["node", "dist/index.js"]

# Docker healthcheck using Node to avoid relying on curl/wget availability
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
	CMD node -e "const http=require('http');http.get('http://127.0.0.1:3333/api/health/ready',res=>{process.exit(res.statusCode===200?0:1)}).on('error',()=>process.exit(1))"
