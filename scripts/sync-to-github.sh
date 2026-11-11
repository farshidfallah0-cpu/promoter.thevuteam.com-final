#!/usr/bin/env bash
# Keeps the GitHub repo in step with what actually runs on this server.
#   1. copies the live backend source (/var/www/promoter/backend, the real prod code) into backend/app/
#   2. copies the live nginx / systemd configs into deploy/live/
#   3. commits everything that changed (secrets and personal data are never added — see .gitignore + the scan below)
#   4. pushes to origin (skipped quietly when there is nothing new or the machine is offline)
# Safe to run any time, also from cron / the Claude Code Stop hook. Usage:  scripts/sync-to-github.sh [--no-push] [-m "message"]
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
PROD=/var/www/promoter/backend
LOG="$REPO/.sync.log"
PUSH=1; MSG=""
while [ $# -gt 0 ]; do case "$1" in --no-push) PUSH=0;; -m) shift; MSG="${1:-}";; esac; shift; done

exec 9>"/tmp/vu-sync-github.lock"
flock -n 9 || { echo "another sync is running"; exit 0; }
cd "$REPO" || exit 1
log() { echo "$(date '+%F %T') $*" >> "$LOG"; }

# 1) live backend source → repo (source files only: never .env, databases, uploads, logs, backups, venv)
if [ -d "$PROD" ]; then
  mkdir -p backend/app
  for f in main.py models.py auth.py sheets_client.py migrate.py create_admin.py reset_password.py test.py fields.json requirements.txt; do
    [ -f "$PROD/$f" ] && cp -f "$PROD/$f" "backend/app/$f"
  done
  [ -d "$PROD/fonts" ] && mkdir -p backend/app/fonts && cp -rf "$PROD/fonts/." backend/app/fonts/
fi
# 2) live server configs
mkdir -p deploy/live
cp -f /etc/nginx/sites-enabled/promoter-api deploy/live/nginx-promoter-api.conf 2>/dev/null
cp -f /etc/nginx/sites-enabled/promoter-frontend deploy/live/nginx-promoter-frontend.conf 2>/dev/null
systemctl cat vu-backend 2>/dev/null | grep -v '^#' > deploy/live/vu-backend.service.txt

# 3) commit
git add -A >/dev/null 2>&1
if git diff --cached --quiet; then log "nothing to commit"; exit 0; fi

# Safety net: refuse to publish secrets / personal data even if .gitignore was edited by mistake.
BAD_PATHS=$(git diff --cached --name-only | grep -E '(^|/)(\.env[^/]*|[^/]*\.db[^/]*|[^/]*\.(sqlite3?|xlsx|xls|pem|key))$|(^|/)uploads/|(^|/)mehramStores\.js$' | grep -v -E '\.env(\.[a-z]+)*\.example$|\.env\.production$')
BIG=$(git diff --cached --name-only | while read -r f; do [ -f "$f" ] && [ "$(stat -c%s "$f")" -gt 3000000 ] && echo "$f"; done)
LEAK=$(git diff --cached -U0 | grep -E '^\+' | grep -E -i 'AIza[0-9A-Za-z_-]{30,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY|sk-[A-Za-z0-9]{30,}|(SECRET|ENCRYPTION)_KEY\s*=\s*[A-Za-z0-9_=+/-]{30,}' | grep -v -i -E 'replace-with|your-|changeme|<[a-z_ -]+>' | head -3)
if [ -n "$BAD_PATHS$BIG$LEAK" ]; then
  git reset -q
  log "ABORTED: sensitive content staged -> $BAD_PATHS $BIG ${LEAK:0:80}"
  echo "sync aborted: sensitive file or secret in the change set (see $LOG)" >&2
  exit 2
fi

SUMMARY=$(git diff --cached --name-only | sed 's#/[^/]*$##' | sort | uniq -c | sort -rn | head -4 | awk '{printf "%s(%s) ",$2,$1}')
git -c user.name="${GIT_AUTHOR_NAME:-farshidfallah0-cpu}" -c user.email="${GIT_AUTHOR_EMAIL:-250184520+farshidfallah0-cpu@users.noreply.github.com}" \
    commit -q -m "${MSG:-sync: $(date '+%F %H:%M') — $SUMMARY}" && log "committed: $SUMMARY"

# 4) push
if [ "$PUSH" = 1 ] && git remote get-url origin >/dev/null 2>&1; then
  if timeout 60 git push -q origin HEAD 2>>"$LOG"; then log "pushed"; else log "push FAILED (offline / deploy key missing?)"; echo "push failed, see $LOG" >&2; exit 3; fi
fi
exit 0
