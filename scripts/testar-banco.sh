#!/usr/bin/env bash
# Roda os testes de segurança do banco num Postgres temporário.
# Uso: bash scripts/testar-banco.sh
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DADOS="$(mktemp -d)"
PORTA=55432

# o Postgres não roda como root: usa o usuário "postgres" se for o caso
EXEC=()
if [ "$(id -u)" = "0" ]; then
  id postgres >/dev/null 2>&1 || useradd -m postgres
  chown -R postgres "$DADOS"
  EXEC=(runuser -u postgres --)
fi

limpar() { "${EXEC[@]}" "$PGBIN/pg_ctl" -D "$DADOS" stop -m fast >/dev/null 2>&1 || true; rm -rf "$DADOS"; }
trap limpar EXIT

"${EXEC[@]}" "$PGBIN/initdb" -D "$DADOS" -U postgres -A trust -E UTF8 --locale=C.UTF-8 >/dev/null
"${EXEC[@]}" "$PGBIN/pg_ctl" -D "$DADOS" -o "-p $PORTA -k $DADOS -c listen_addresses=''" -l "$DADOS/log" start >/dev/null

PSQL=("${EXEC[@]}" "$PGBIN/psql" -h "$DADOS" -p "$PORTA" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" < "$RAIZ/supabase/testes/local/imitacao_supabase.sql"
for m in "$RAIZ"/supabase/migrations/*.sql; do
  "${PSQL[@]}" < "$m"
done

# testes dentro de uma transação desfeita no final
{ echo "begin;"; cat "$RAIZ/supabase/testes/seguranca.sql"; echo "rollback;"; } | "${PSQL[@]}" -t -A | grep -v "^$"
