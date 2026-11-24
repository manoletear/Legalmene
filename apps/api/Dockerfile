# Imagen de la API (ECS Fargate). Se construye desde la raíz del repo:
#   docker build -f apps/api/Dockerfile -t legalmene-api .
# Al iniciar, ejecutar las migraciones con:
#   node dist/apps/api/src/db/migrate.js   (usa ./drizzle/migrations y DATABASE_URL)

FROM node:22-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@9.15.0
# Solo los manifiestos primero, para reutilizar la capa de dependencias.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter "@legalmene/api..."
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @legalmene/shared build && pnpm --filter @legalmene/api build
# Directorio autónomo con dependencias de producción (incluye @legalmene/shared compilado).
RUN pnpm --filter @legalmene/api deploy --prod /out

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /out ./
# Certificados de RDS/Aurora para verificar el TLS de la base (DB_SSL_CA, ver src/db/url.ts).
ADD --chmod=644 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /app/certs/rds-global-bundle.pem
EXPOSE 3001
USER node
CMD ["node", "dist/apps/api/src/main.js"]
