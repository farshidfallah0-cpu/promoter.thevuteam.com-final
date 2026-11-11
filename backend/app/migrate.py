import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from auth import encrypt_value, decrypt_value

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'promoters.db')

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

cols = [row[1] for row in cur.execute('PRAGMA table_info(promoters)')]
print('current columns:', cols)

if 'event_id' not in cols:
    cur.execute('ALTER TABLE promoters ADD COLUMN event_id INTEGER REFERENCES events(id)')
    print('added event_id')
else:
    print('event_id already exists')

if 'plain_password' not in cols:
    cur.execute('ALTER TABLE promoters ADD COLUMN plain_password TEXT')
    print('added plain_password')
else:
    print('plain_password already exists')

conn.commit()

# Drop UNIQUE index on promoters(username) if unique, and recreate as non-unique index
idx_list = cur.execute('PRAGMA index_list(promoters)').fetchall()
for idx in idx_list:
    if idx[1] == 'ix_promoters_username' and idx[2] == 1:
        cur.execute('DROP INDEX ix_promoters_username')
        cur.execute('CREATE INDEX ix_promoters_username ON promoters (username)')
        print('Converted ix_promoters_username to non-unique index')
        break

conn.commit()

# Encrypt any plain_password values still stored as plaintext from before the
# encryption change. Safe to re-run: values that already decrypt successfully
# (already encrypted) are left untouched.
migrated = 0
pending = cur.execute('SELECT id, plain_password FROM promoters WHERE plain_password IS NOT NULL').fetchall()
for row_id, value in pending:
    if decrypt_value(value) is not None:
        continue  # already an encrypted token
    cur.execute('UPDATE promoters SET plain_password = ? WHERE id = ?', (encrypt_value(value), row_id))
    migrated += 1

conn.commit()
conn.close()
print(f'encrypted {migrated} legacy plaintext password(s)')
print('migration done')
