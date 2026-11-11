import sqlite3, json
conn = sqlite3.connect('promoters.db')
cur = conn.cursor()
cur.execute('SELECT name, fields FROM events ORDER BY id DESC LIMIT 1')
res = cur.fetchone()
with open('fields.json', 'w', encoding='utf-8') as f:
    f.write(json.dumps(json.loads(res[1]), ensure_ascii=False, indent=2))
