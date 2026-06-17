#!/bin/sh
set -e

# Coolify injeta PORT; se vier vazio ou inválido, usa 80 (padrão nginx estático).
case "${PORT:-}" in
  ''|*[!0-9]*)
    export PORT=80
    ;;
esac

echo "[nginx] PORT=${PORT}"

if [ ! -f /usr/share/nginx/html/index.html ]; then
  echo "[nginx] ERRO: /usr/share/nginx/html/index.html não existe — build do Vite falhou?"
  exit 1
fi

envsubst '${PORT}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

nginx -t
exec nginx -g 'daemon off;'
