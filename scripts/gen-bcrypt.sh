#!/usr/bin/env bash
set -euo pipefail
# Prefira o prompt: argumentos ficam no histórico e na lista de processos.
password=${1-}
if [[ $# -eq 0 ]]; then
  read -r -s -p 'Senha do administrador: ' password
  printf '\n' >&2
fi
bytes=$(printf '%s' "$password" | wc -c)
if (( bytes < 6 || bytes > 72 )) || [[ "$password" == *$'\n'* || "$password" == *$'\r'* ]]; then
  printf 'A senha deve ter de 6 a 72 bytes UTF-8, sem quebras de linha.\n' >&2
  exit 1
fi
# -i recebe a senha por stdin; nenhum arquivo, porta ou volume é criado.
result=$(printf '%s\n' "$password" | docker run --rm -i httpd:2.4-alpine htpasswd -niBC 10 x)
unset password
hash=${result#x:}
hash=${hash//$'\r'/}
[[ "$hash" =~ ^\$2y\$10\$[./A-Za-z0-9]{53}$ ]] || { printf 'Hash BCrypt inválido.\n' >&2; exit 1; }
printf '%s\n' "${hash/\$2y\$/\$2a\$}"
