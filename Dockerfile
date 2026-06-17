FROM node:20-slim AS builder

WORKDIR /app

ARG VITE_API_URL=
ARG VITE_GOOGLE_MAPS_API_KEY=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine AS runner

ENV PORT=80

COPY nginx/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD sh -c 'wget -q -O /dev/null "http://127.0.0.1:${PORT:-80}/health" || wget -q -O /dev/null http://127.0.0.1:80/health || exit 1'

ENTRYPOINT ["/docker-entrypoint.sh"]
