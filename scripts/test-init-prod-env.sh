#!/usr/bin/env sh
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
test_dir=$(mktemp -d)
trap 'rm -f "$test_dir/.env.prod"; rmdir "$test_dir"' EXIT
umask 022
sh "$script_dir/init-prod-env.sh" "$test_dir/.env.prod"
[ "$(stat -c %a "$test_dir/.env.prod")" = 600 ]
if sh "$script_dir/init-prod-env.sh" "$test_dir/.env.prod"; then
  echo 'Arquivo existente foi sobrescrito.' >&2
  exit 1
fi
echo 'Permissao 600 e recusa de sobrescrita verificadas.'
