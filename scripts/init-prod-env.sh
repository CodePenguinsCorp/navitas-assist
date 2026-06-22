#!/usr/bin/env sh
set -eu

output_path="${1:-.env.prod}"
backend_image="${BACKEND_IMAGE:-navitas-assist-backend:ci}"
frontend_image="${FRONTEND_IMAGE:-navitas-assist-frontend:ci}"
admin_username="${APP_ADMIN_USERNAME:-admin}"
admin_full_name="${APP_ADMIN_FULL_NAME:-Administrador}"

if [ -f "$output_path" ]; then
  echo "Arquivo $output_path ja existe. Remova-o ou escolha outro caminho."
  exit 1
fi

new_hex_secret() {
  byte_count="$1"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$byte_count"
    return
  fi

  python - "$byte_count" <<'PY'
import secrets
import sys
print(secrets.token_hex(int(sys.argv[1])))
PY
}

mysql_password="$(new_hex_secret 24)"
mysql_root_password="$(new_hex_secret 24)"
admin_password="$(new_hex_secret 18)"

cat >"$output_path" <<EOF
# Production Compose
FRONTEND_PORT=80
MYSQL_DATABASE=navitas_assist
MYSQL_USER=navitas_app
MYSQL_PASSWORD=$mysql_password
MYSQL_ROOT_PASSWORD=$mysql_root_password

# Images published by CD
BACKEND_IMAGE=$backend_image
FRONTEND_IMAGE=$frontend_image

# Backend / Spring Boot
APP_ADMIN_USERNAME=$admin_username
APP_ADMIN_PASSWORD=$admin_password
APP_ADMIN_FULL_NAME=$admin_full_name
EOF

echo "Arquivo $output_path criado com segredos fortes."
echo "Guarde a senha inicial do admin em um cofre antes do primeiro deploy."
