# عملیات: دیپلوی، بکاپ، دیتابیس، GitHub

## چیدمان روی سرور
| چیز | مسیر |
|---|---|
| بک‌اند (کد، `.env`، `promoters.db`، `uploads/`) | `/var/www/promoter/backend/` |
| فرانت‌اند بیلدشده | `/var/www/promoter/frontend/` |
| سرویس | `systemctl status vu-backend` (uvicorn، ۲ worker، پورت ۸۰۰۰) |
| nginx | `/etc/nginx/sites-enabled/promoter-api` و `promoter-frontend` (کپی در `deploy/live/`) |
| سورس فرانت و ریپو | `/root/VU-event` |
| بکاپ‌ها | کنار فایل‌ها: `frontend-backup-<ts>`، `promoters.db.bak-<دلیل>-<ts>`، و `/root/backups/private/` |

## دیپلوی فرانت‌اند
```bash
cd /root/VU-event/frontend && npx vite build
TS=$(date +%s); cp -a /var/www/promoter/frontend /var/www/promoter/frontend-backup-$TS
rm -rf /var/www/promoter/frontend/assets && cp -a dist/. /var/www/promoter/frontend/
curl -s -o /dev/null -w "%{http_code}\n" https://promoter.thevuteam.com/admin     # 200
```
بعد از دیپلوی کاربران باید Cmd/Ctrl+Shift+R بزنند؛ پروموترها یک بار صفحه را ببندند و باز کنند.

## دیپلوی بک‌اند
1. بکاپ: `cp main.py main.py.bak-<دلیل>-$(date +%s)` و بکاپ دیتابیس (پایین).
2. تست روی کپی: کپی همه‌ی `*.py` + یک نسخه‌ی backup از دیتابیس در یک پوشه‌ی موقت → `uvicorn main:app --port 8011` → با توکن ساختگی (`auth.create_access_token({'sub':..., 'user_id':...})`) endpointها را صدا بزن.
3. `python3 -m py_compile main.py models.py` سپس `systemctl restart vu-backend` (چند ثانیه قطعی) و چک `curl https://api.promoter.thevuteam.com/docs`.
4. جدول جدید خودکار ساخته می‌شود؛ برای ستون جدید یک `_migrate_*` در `models.py` بنویس.

## دیتابیس (SQLite، حالت WAL)
- خواندن امن: `sqlite3.connect('file:/var/www/promoter/backend/promoters.db?mode=ro', uri=True)`.
- بکاپ سازگار (حتی وقتی سرویس روشن است): `src.backup(dst)` (sqlite backup API) — فقط کپی فایل `.db` کافی نیست چون WAL دارد.
- هر ویرایش داده (حذف گزارش، تغییر پاسخ‌ها، ...) فقط بعد از بکاپ و ترجیحاً با تراکنش `BEGIN IMMEDIATE`.

## تنظیمات سرور که اعمال شده
- **BBR** برای TCP (سرور در آلمان، کاربران در ایران): `/etc/sysctl.d/99-bbr.conf` و `/etc/modules-load.d/bbr.conf`. برگشت: `sysctl -w net.ipv4.tcp_congestion_control=cubic`.
- **آپلود عکس:** فشرده‌سازی سمت کلاینت تا ≈۳۰۰KB و عرض ۱۰۲۴px (`EventForm.jsx → compressImage`)؛ ۳ بار تلاش مجدد + بازیابی با `X-Upload-Id`؛ nginx: `client_max_body_size 25m`, `client_body_timeout 180s`. حدود ۱۰٪ آپلودها به‌خاطر خط ضعیف موبایل شکست می‌خورد (علت: مسیر بین‌المللی)، نه بک‌اند.

## همگام‌سازی با GitHub
ریپو: `github.com/farshidfallah0-cpu/promoter.thevuteam.com-final` (**عمومی**).
- `scripts/sync-to-github.sh`: کد زنده‌ی بک‌اند و تنظیمات nginx/systemd را در ریپو کپی می‌کند، commit می‌زند و push می‌کند. قبل از commit اسکن امنیتی دارد (فایل‌های `.env`/DB/xlsx/آپلود، `mehramStores.js`، کلید API) و در صورت مشاهده **متوقف می‌شود**.
- **خودکارسازی (فعلاً فعال نشده — دو گزینه، هر کدام یا هر دو):**
  1. کرون هر ۳۰ دقیقه: `( crontab -l 2>/dev/null; echo "*/30 * * * * /root/VU-event/scripts/sync-to-github.sh >/dev/null 2>&1" ) | crontab -`
  2. هوک `Stop` در Claude Code بعد از هر پاسخ (فایل `/root/VU-event/.claude/settings.json`):
     `{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"nohup /root/VU-event/scripts/sync-to-github.sh >/dev/null 2>&1 &","timeout":10}]}]}}`
  تا وقتی فعال نشده، بعد از هر تغییر مهم `scripts/sync-to-github.sh` را دستی اجرا کنید.
- دستی: `/root/VU-event/scripts/sync-to-github.sh -m "توضیح تغییر"` یا `--no-push`.
- احراز هویت: **deploy key** با دسترسی نوشتن (کلید خصوصی `/root/.ssh/github_vu_deploy`، alias `github-vu` در `~/.ssh/config`). اگر push خطا داد: لاگ `.sync.log`؛ احتمالاً کلید در GitHub → Settings → Deploy keys (✓ Allow write access) اضافه نشده.

## داده‌های خصوصی (در ریپو نیست)
| چیز | چرا خصوصی است | بکاپ/بازیابی |
|---|---|---|
| `frontend/src/components/MehramSupermarketReport/mehramStores.js` | نام/تلفن/آدرس صاحبان فروشگاه | `scripts/backup-private.sh`؛ بازیابی: tar را باز کن و فایل را سر جایش بگذار |
| `*.xlsx` (لیست‌های مشتری) | کد ملی و اطلاعات تماس | همان بکاپ |
| `backend/.env`، `frontend/.env*` | کلیدها | همان بکاپ |
| `promoters.db`، `uploads/` | همه‌ی داده‌ی کاربران و عکس‌ها | بکاپ سازگار دیتابیس در همان tar؛ `uploads/` را جدا (rsync) بکاپ بگیرید |

`/root/backups/private/vu-private-*.tar.gz` را گاهی **خارج از این سرور** کپی کنید (اگر سرور خراب شود بکاپ روی همان ماشین بی‌فایده است).
اگر ریپو را **Private** کردید و خواستید داده‌ی فروشگاه‌ها هم در گیت باشد: خطوط مربوطه در `.gitignore` (و الگوی `mehramStores\.js` در اسکن `sync-to-github.sh`) را بردارید.

## کلیدها
- در سورس هیچ کلیدی نیست؛ `GOOGLE_API_KEY`، `SECRET_KEY`، `ENCRYPTION_KEY` فقط در `.env`.
- اگر کلیدی قبلاً داخل فایلی بوده (مثل `ai_tools/promoter_analyzer.py` و رمز `make_admin.py` قبل از انتشار) توصیه می‌شود در Google Cloud / برنامه چرخانده (rotate) شود.
