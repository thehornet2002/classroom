# Stage 1: Build Frontend Web Application
FROM node:20-alpine AS builder
WORKDIR /app/frontend

COPY frontend/package.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# Stage 2: Production Server (Node.js + WebSockets + Static Assets)
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY chabokan/package.json ./
RUN npm install --omit=dev

COPY chabokan/server.js ./
COPY --from=builder /app/frontend/dist ./public

EXPOSE 3000

CMD ["node", "server.js"]
