## ── Stage 1: Build ──────────────────────────────────
FROM node:22-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

## ── Stage 2: Production ─────────────────────────────
FROM node:22-alpine
RUN apk add --no-cache wget python3 make g++
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist/
EXPOSE 8787
CMD ["node", "dist/index.js"]
