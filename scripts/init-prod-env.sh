#!/usr/bin/env sh
set -eu
umask 077

output_path="${1:-.env.prod}"
backend_image="${BACKEND_IMAGE:-navitas-assist-backend:ci}"
frontend_image="${FRONTEND_IMAGE:-navitas-assist-frontend:ci}"

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

postgres_password="$(new_hex_secret 24)"

cat >"$output_path" <<EOF
# Production Compose
FRONTEND_PORT=80
POSTGRES_DB=navitas_assist
POSTGRES_USER=navitas_app
POSTGRES_PASSWORD=$postgres_password

# Images published by CD
BACKEND_IMAGE=$backend_image
FRONTEND_IMAGE=$frontend_image
EOF

chmod 600 "$output_path"

echo "Arquivo $output_path criado com segredos fortes."
echo "As contas da aplicacao sao gerenciadas no banco e nao sao criadas pelo deploy."
