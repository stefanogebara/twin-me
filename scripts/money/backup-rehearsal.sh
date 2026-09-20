#!/usr/bin/env bash
# The ledger's backup, rehearsed: dump it, restore it somewhere else, prove the copy is the
# original (audit M0-4, 2026-09-20). Run before any migration that touches money_* tables.
#
#   scripts/money/backup-rehearsal.sh dump    <SOURCE_URL> <file.dump>
#   scripts/money/backup-rehearsal.sh restore <file.dump>  <ADMIN_URL> <new_database>
#   scripts/money/backup-rehearsal.sh verify  <URL_A> <URL_B>
#   scripts/money/backup-rehearsal.sh rehearse <SOURCE_URL> [ADMIN_URL]
#
# dump     pg_dump of the public schema (tables, functions, policies) in custom format.
# restore  creates <new_database> on the server ADMIN_URL points at (Supabase cannot create a
#          database: restore a production dump into a local Postgres 16), prepares the roles
#          and the auth.uid() stub the policies need, then pg_restore.
# verify   for every money_* table: the row count in both, and for the tables that are the
#          ledger (transactions, sightings, accounts, facts, figure_scores) an md5 of every
#          row in id order. Exit 1 on the first difference.
# rehearse dump SOURCE, restore into <db>_rehearsal_<time> on ADMIN_URL (default: the same
#          server), verify against SOURCE, drop the copy. This is the rehearsal.
#
# Production: SOURCE_URL is the Supabase direct connection (postgres role, port 5432, not the
# pooler); ADMIN_URL a local Postgres 16 with rolcreatedb. Nothing here writes to SOURCE.
set -euo pipefail

LEDGER_TABLES="money_transactions money_sightings money_accounts money_facts money_figure_scores"
say() { printf '%s\n' "$*" >&2; }

cmd_dump() {
  local src="$1" file="$2"
  say "dumping public schema of ${src##*@} to $file"
  pg_dump --format=custom --no-owner --schema=public --file="$file" "$src"
  say "dumped $(du -h "$file" | cut -f1)"
}

prepare_target() {
  local url="$1"
  psql -v ON_ERROR_STOP=1 -q "$url" <<'SQL'
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
-- The dump carries CREATE SCHEMA public itself; the fresh database's own must not be in the way.
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
SQL
}

db_url() { # replace the database in a URL
  local url="$1" db="$2"
  printf '%s' "${url%/*}/$db"
}

cmd_restore() {
  local file="$1" admin="$2" newdb="$3"
  say "creating database $newdb"
  psql -v ON_ERROR_STOP=1 -q "$admin" -c "CREATE DATABASE \"$newdb\" TEMPLATE template0"
  local target; target="$(db_url "$admin" "$newdb")"
  prepare_target "$target"
  say "restoring $file into $newdb"
  # --no-owner: the dumping role need not exist here; the roles the grants name were prepared.
  pg_restore --no-owner --exit-on-error --dbname="$target" "$file"
  psql -v ON_ERROR_STOP=1 -q "$target" -c "GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role"
  say "restored"
}

fingerprint() { # per table: count, and for the ledger tables an md5 of every row in id order
  local url="$1"
  psql -v ON_ERROR_STOP=1 -At "$url" <<SQL
SELECT table_name || ' ' || (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM public.' || quote_ident(table_name), false, true, '')))[1]::text
FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'money\_%' ORDER BY table_name;
SQL
  for t in $LEDGER_TABLES; do
    psql -v ON_ERROR_STOP=1 -At "$url" -c "SELECT '$t md5 ' || coalesce(md5(string_agg(t::text, E'\n' ORDER BY id)), 'empty') FROM public.$t t"
  done
}

cmd_verify() {
  local a="$1" b="$2"
  local fa fb
  fa="$(fingerprint "$a")"; fb="$(fingerprint "$b")"
  if [ "$fa" = "$fb" ]; then
    say "verified: $(printf '%s\n' "$fa" | grep -c ' ') lines identical"
    printf '%s\n' "$fa"
  else
    say "DIFFERENT:"
    diff <(printf '%s\n' "$fa") <(printf '%s\n' "$fb") >&2 || true
    return 1
  fi
}

cmd_rehearse() {
  local src="$1" admin="${2:-$1}"
  local stamp; stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  local srcdb="${src##*/}"; srcdb="${srcdb%%\?*}"
  local newdb="${srcdb}_rehearsal_${stamp}"
  local file; file="$(mktemp -t money-rehearsal).dump"
  cmd_dump "$src" "$file"
  cmd_restore "$file" "$admin" "$newdb"
  if cmd_verify "$src" "$(db_url "$admin" "$newdb")"; then
    say "REHEARSAL PASSED: $srcdb restored as $newdb and verified"
    psql -q "$admin" -c "DROP DATABASE \"$newdb\""; rm -f "$file"
  else
    say "REHEARSAL FAILED: $newdb and $file are kept for inspection"
    return 1
  fi
}

case "${1:-}" in
  dump) cmd_dump "$2" "$3" ;;
  restore) cmd_restore "$2" "$3" "$4" ;;
  verify) cmd_verify "$2" "$3" ;;
  rehearse) cmd_rehearse "$2" "${3:-}" ;;
  *) sed -n '2,20p' "$0" >&2; exit 2 ;;
esac
