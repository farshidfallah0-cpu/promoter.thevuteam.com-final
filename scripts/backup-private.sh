#!/usr/bin/env bash
# Backs up everything that must NOT go to the public GitHub repo: the real store list, the client's spreadsheets,
# the .env files and a consistent copy of the live database (SQLite backup API — the DB is in WAL mode).
# Output: /root/backups/private/vu-private-<timestamp>.tar.gz  (copy it somewhere safe, off this server, now and then)
set -eu
REPO="$(cd "$(dirname "$0")/.." && pwd)"
OUT=/root/backups/private; TS=$(date +%Y%m%d-%H%M%S); TMP=$(mktemp -d)
mkdir -p "$OUT" "$TMP/private"
cp -a "$REPO"/frontend/src/components/MehramSupermarketReport/mehramStores.js "$TMP/private/" 2>/dev/null || true
cp -a "$REPO"/frontend/src/components/MehramSupermarketReport/*.xlsx "$TMP/private/" 2>/dev/null || true
cp -a /var/www/promoter/backend/.env "$TMP/private/backend.env" 2>/dev/null || true
cp -a "$REPO"/frontend/.env "$REPO"/frontend/.env.production "$TMP/private/" 2>/dev/null || true
python3 - "$TMP/private/promoters.db" <<'PY'
import sqlite3, sys
s = sqlite3.connect('file:/var/www/promoter/backend/promoters.db?mode=ro', uri=True); d = sqlite3.connect(sys.argv[1]); s.backup(d); d.close()
PY
tar -czf "$OUT/vu-private-$TS.tar.gz" -C "$TMP" private
chmod 600 "$OUT/vu-private-$TS.tar.gz"; rm -rf "$TMP"
ls -t "$OUT"/vu-private-*.tar.gz | tail -n +11 | xargs -r rm -f   # keep the 10 newest
echo "$OUT/vu-private-$TS.tar.gz"
