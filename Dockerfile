FROM node:22-bookworm-slim AS frontend-build

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend ./
RUN npm run build


FROM node:22-bookworm-slim

ENV NODE_ENV=production
ENV PORT=8080
ENV ADMIN_ASSET_WARMUP=false

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY backend /app/backend
COPY data /app/data
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

EXPOSE 8080

CMD ["node", "server.js"]

