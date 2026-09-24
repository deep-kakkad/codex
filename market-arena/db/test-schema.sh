#!/usr/bin/env bash
# Applies db/001_init.sql to a throwaway Postgres and checks the rules it is
# supposed to enforce. Needs the postgres server binaries; costs nothing and
# touches no real database.
#
#   ./db/test-schema.sh
set -uo pipefail
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PGDATA=${PGDATA:-/tmp/ma-pgtest}
PORT=${PORT:-5499}
SQL="$(cd "$(dirname "$0")" && pwd)/001_init.sql"
FAIL=0

# Postgres refuses to run as root, so the cluster runs as an unprivileged user.
RUNAS=${RUNAS:-nobody}
rm -rf "$PGDATA"; mkdir -p "$PGDATA"; chown "$RUNAS" "$PGDATA"; chmod 700 "$PGDATA"
su -s /bin/bash "$RUNAS" -c "$PGBIN/initdb -D $PGDATA -U tester --auth=trust" >/dev/null 2>&1
su -s /bin/bash "$RUNAS" -c "$PGBIN/pg_ctl -D $PGDATA -o \"-p $PORT -k $PGDATA -c listen_addresses=''\" -l $PGDATA/log start" >/dev/null 2>&1
sleep 3
cleanup(){ su -s /bin/bash "$RUNAS" -c "$PGBIN/pg_ctl -D $PGDATA stop" >/dev/null 2>&1; rm -rf "$PGDATA"; }
trap cleanup EXIT

q(){ psql -h "$PGDATA" -p "$PORT" -U tester -d marketarena -t -A -c "$1" 2>&1; }
ok(){ printf "ok  %s\n" "$1"; }
no(){ printf "FAIL %s -- %s\n" "$1" "$2"; FAIL=1; }

psql -h "$PGDATA" -p "$PORT" -U tester -d postgres -c "CREATE DATABASE marketarena;" >/dev/null 2>&1
psql -h "$PGDATA" -p "$PORT" -U tester -d marketarena -v ON_ERROR_STOP=1 -q -f "$SQL" \
  && ok "migration applies to a fresh database" || no "migration" "failed to apply"
psql -h "$PGDATA" -p "$PORT" -U tester -d marketarena -v ON_ERROR_STOP=1 -q -f "$SQL" >/dev/null 2>&1 \
  && ok "migration is idempotent" || no "idempotency" "re-run failed"

q "INSERT INTO users (id,email) VALUES ('u1','a@example.com');" >/dev/null
q "INSERT INTO credit_entries (user_id,delta,reason) VALUES ('u1',100,'signup');" >/dev/null
q "INSERT INTO credit_entries (user_id,delta,reason,ref) VALUES ('u1',-1,'round','r1'),('u1',-10,'ask','q1');" >/dev/null
[ "$(q "SELECT balance FROM credit_balances WHERE user_id='u1';")" = "89" ] \
  && ok "balance is the sum of the ledger (100 - 1 - 10 = 89)" || no "balance" "expected 89"

OUT=$(q "INSERT INTO credit_entries (user_id,delta,reason) VALUES ('u1',100,'signup');")
case "$OUT" in *"duplicate key"*) ok "a second signup grant is refused by the database";;
  *) no "double grant" "a retried sign-in could mint credits: $OUT";; esac

q "INSERT INTO credit_entries (user_id,delta,reason,ref) VALUES ('u1',10,'refund','q1');" >/dev/null
[ "$(q "SELECT balance FROM credit_balances WHERE user_id='u1';")" = "99" ] \
  && ok "a failed paid call can be refunded" || no "refund" "expected 99"

OUT=$(q "INSERT INTO credit_entries (user_id,delta,reason) VALUES ('u1',-5,'mystery');")
case "$OUT" in *"check constraint"*) ok "an unknown spend reason is refused";;
  *) no "reason check" "arbitrary reasons accepted: $OUT";; esac

q "INSERT INTO projects (id,user_id,name) VALUES ('p1','u1','P');" >/dev/null
q "INSERT INTO rounds (id,project_id,user_id,seq,result) VALUES ('r1','p1','u1',1,'{}'::jsonb);" >/dev/null
q "INSERT INTO ask_log (user_id,round_id,question,model) VALUES ('u1','r1','why?','claude-haiku-4-5');" >/dev/null
q "DELETE FROM users WHERE id='u1';" >/dev/null
LEFT=$(( $(q "SELECT count(*) FROM credit_entries;") + $(q "SELECT count(*) FROM projects;") \
       + $(q "SELECT count(*) FROM rounds;") + $(q "SELECT count(*) FROM ask_log;") ))
[ "$LEFT" = "0" ] && ok "deleting an account removes every row that belonged to it" \
  || no "delete" "$LEFT orphaned rows -- a delete-my-account request would not be honoured"

q "INSERT INTO users (id,email) VALUES ('u2','b@example.com');" >/dev/null
q "INSERT INTO projects (id,user_id,name) VALUES ('p2','u2','P');" >/dev/null
q "INSERT INTO rounds (id,project_id,user_id,seq,result) VALUES ('ra','p2','u2',1,'{}'::jsonb);" >/dev/null
OUT=$(q "INSERT INTO rounds (id,project_id,user_id,seq,result) VALUES ('rb','p2','u2',1,'{}'::jsonb);")
case "$OUT" in *"duplicate key"*) ok "two round 1s in one project are refused";;
  *) no "round seq" "round numbering can collide: $OUT";; esac

echo
[ "$FAIL" = "0" ] && echo "all schema tests passed" || { echo "SCHEMA TESTS FAILED"; exit 1; }
