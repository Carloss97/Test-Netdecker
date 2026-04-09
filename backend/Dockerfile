FROM node:20 AS builder
WORKDIR /usr/src/app

# Install dependencies and build
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci

# Copy backend source
COPY backend/ .

RUN npm run prisma:generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY --from=builder /usr/src/app/package.json ./
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 3333
CMD ["node", "dist/index.js"]
