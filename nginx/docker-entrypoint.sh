#!/bin/sh
set -e

COOLIFY_PORT="${PORT:-80}"
case "$COOLIFY_PORT" in
  ''|*[!0-9]*)
    COOLIFY_PORT=80
    ;;
esac

if [ "$COOLIFY_PORT" = "80" ]; then
  echo "[nginx] escutando na porta 80"
else
  echo "[nginx] escutando nas portas 80 e ${COOLIFY_PORT} (Coolify PORT=${COOLIFY_PORT})"
fi

if [ ! -f /usr/share/nginx/html/index.html ]; then
  echo "[nginx] ERRO: /usr/share/nginx/html/index.html não existe — build do Vite falhou?"
  exit 1
fi

{
  echo "server {"
  echo "  listen 80 default_server;"
  echo "  listen [::]:80 default_server;"
  if [ "$COOLIFY_PORT" != "80" ]; then
    echo "  listen ${COOLIFY_PORT} default_server;"
    echo "  listen [::]:${COOLIFY_PORT} default_server;"
  fi
  echo "  server_name _;"
  echo ""
  echo "  root /usr/share/nginx/html;"
  echo "  index index.html;"
  echo ""
  echo "  location /health {"
  echo "    access_log off;"
  echo "    add_header Content-Type text/plain;"
  echo "    return 200 \"ok\\n\";"
  echo "  }"
  echo ""
  echo "  location / {"
  echo "    try_files \$uri \$uri/ /index.html;"
  echo "  }"
  echo "}"
} > /etc/nginx/conf.d/default.conf

nginx -t
exec nginx -g 'daemon off;'
