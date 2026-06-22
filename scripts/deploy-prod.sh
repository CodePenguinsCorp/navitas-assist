#!/usr/bin/env sh
set -eu

compose_file="${1:-compose.prod.yaml}"
env_file="${2:-.env.prod}"

if [ ! -f "$compose_file" ]; then
  echo "Arquivo $compose_file nao encontrado."
  exit 1
fi

if [ ! -f "$env_file" ]; then
  echo "Arquivo $env_file nao encontrado."
  exit 1
fi

docker compose --env-file "$env_file" -f "$compose_file" pull
docker compose --env-file "$env_file" -f "$compose_file" up -d
docker compose --env-file "$env_file" -f "$compose_file" ps
