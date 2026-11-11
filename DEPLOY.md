# راهنمای دیپلوی VU Event Platform

این راهنما رو از بالا به پایین، دقیقاً به همین ترتیب اجرا کن. هر بخش می‌گه کجا اجرا بشه:
**«لوکال»** یعنی توی ترمینال ویندوز خودت (پوشه پروژه)، **«سرور»** یعنی داخل SSH روی سرور.

فرض‌های این راهنما:
- سرور یه Ubuntu/Debian تازه‌ست (اگه چیز دیگه‌ایه، دستورهای `apt` رو با پکیج‌منیجر خودش عوض کن).
- از همون Host alias `kongere` که توی `~/.ssh/config` داری استفاده می‌کنیم (IP: `45.159.114.174`, پورت `3031`, یوزر `root`) — پس همه‌جا فقط می‌نویسیم `kongere`، نیازی به تایپ IP/پورت نیست.
- فایل‌های آماده‌شده (nginx configs, systemd service, .env template) توی پوشه `deploy/` پروژه هستن.

---

## ۰) پیش‌نیاز: تنظیم DNS

قبل از هر چیز، توی پنل دامنه‌ات (thevuteam.com) این دو رکورد رو بساز و صبر کن پراپاگیت بشه (چند دقیقه تا چند ساعت):

| نوع | نام | مقدار |
|---|---|---|
| A | `promoter` | `45.159.114.174` |
| A | `api.promoter` | `45.159.114.174` |

می‌تونی با این دستور (لوکال) چک کنی که درست resolve می‌شن:
```bash
nslookup promoter.thevuteam.com
nslookup api.promoter.thevuteam.com
```

---

## ۱) اتصال اولیه و نصب پیش‌نیازهای سیستم (سرور)

```bash
ssh kongere
```

داخل سرور:
```bash
apt update && apt upgrade -y
apt install -y nginx python3-venv python3-pip python3-dev build-essential libffi-dev certbot python3-certbot-nginx
```

یوزر مخصوص اجرای بک‌اند رو بساز (بک‌اند به‌جای root با این یوزر محدود اجرا می‌شه):
```bash
useradd -r -s /usr/sbin/nologin vuapp || true
mkdir -p /var/www/promoter/backend /var/www/promoter/frontend
```

اگه فایروال (ufw) روی سرور فعاله، **حتماً** قبل از هر تغییری پورت SSH سفارشی‌ت (`3031`) رو مجاز کن، وگرنه دسترسیت به سرور قطع می‌شه:
```bash
ufw status                 # فقط برای دیدن اینکه فعاله یا نه
# اگه "active" بود:
ufw allow 3031/tcp
ufw allow 'Nginx Full'
```
اگه ufw از قبل غیرفعاله، بهش دست نزن (لازم نیست فعالش کنی).

از سرور خارج شو (`exit`) و برگرد به لوکال.

---

## ۲) بیلد فرانت‌اند (لوکال)

```bash
cd frontend
npm install
npm run build
```

این `frontend/dist` رو می‌سازه، و چون `.env.production` از قبل توی پروژه هست (`VITE_API_URL=https://api.promoter.thevuteam.com`)، آدرس API درست توی بیلد نهایی جا می‌گیره — نیازی به تنظیم دستی نیست.

---

## ۳) آپلود فرانت‌اند به سرور (لوکال)

```bash
scp -r dist/. kongere:/var/www/promoter/frontend/
cd ..
```

---

## ۴) آپلود بک‌اند به سرور (لوکال)

دیتابیس، پوشه uploads و فایل‌های کش/موقت رو عمداً exclude می‌کنیم — سرور باید دیتابیسش کاملاً از صفر ساخته بشه، نه اینکه دیتای تستی لوکالت رو ببره بالا:

```bash
cd backend/app
tar --exclude='*.db' --exclude='*.sqlite3' --exclude='__pycache__' --exclude='uploads' -czf /tmp/backend.tar.gz .
scp /tmp/backend.tar.gz kongere:/tmp/
ssh kongere "tar -xzf /tmp/backend.tar.gz -C /var/www/promoter/backend && mkdir -p /var/www/promoter/backend/uploads && rm /tmp/backend.tar.gz"
cd ../..
```

---

## ۵) نصب و تنظیم بک‌اند (سرور)

```bash
ssh kongere
cd /var/www/promoter/backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

حالا دو تا secret واقعی برای پروداکشن بساز (همینجا، توی همون venv):
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```
خروجی این دو دستور رو یه‌جا نگه‌دار، الان لازمشون داری.

---

## ۶) ساخت فایل `.env` پروداکشن (سرور)

```bash
nano /var/www/promoter/backend/.env
```

این محتوا رو بریز توش (مقادیر `SECRET_KEY` و `ENCRYPTION_KEY` رو از خروجی مرحله قبل جایگزین کن؛ `SPREADSHEET_ID` رو اگه سرویس Google Sheets می‌خوای فعال باشه پر کن، وگرنه خالی بذار — بدون اون بک‌اند بدون مشکل بالا میاد):

```env
SERVICE_ACCOUNT_JSON_PATH=/secrets/sa.json
SPREADSHEET_ID=
SHEET_NAME=Sheet1
SECRET_KEY=<همون مقدار اول>
ENCRYPTION_KEY=<همون مقدار دوم>
PUBLIC_BASE_URL=https://api.promoter.thevuteam.com
GOOGLE_API_KEY=
```

ذخیره کن (`Ctrl+O`, `Enter`, `Ctrl+X`) و دسترسیش رو محدود کن:
```bash
chmod 600 /var/www/promoter/backend/.env
```

> اگه سرویس Google Sheets رو فعال می‌خوای، فایل `sa.json` (سرویس‌اکانت گوگل) رو جدا از لوکالت `scp` کن به `/secrets/sa.json` روی سرور. این فایل جزو پروژه نیست و باید خودت جداگانه داشته باشیش.

---

## ۷) ساخت اولین ادمین (سرور)

هنوز توی `/var/www/promoter/backend` و venv فعاله:
```bash
python create_admin.py <یوزرنیم-ادمین> <پسورد-قوی> --full-name "مدیر سیستم"
deactivate
```

این دستور دیتابیس رو کاملاً از صفر می‌سازه (اسکیمای خالی) و فقط همین یک ادمین رو توش می‌ذاره — دقیقاً همون «دیتابیس صفر، از نو بساز» که می‌خواستی.

---

## ۸) مالکیت فایل‌ها رو بده به یوزر اجراکننده (سرور)

```bash
chown -R vuapp:vuapp /var/www/promoter/backend
```

---

## ۹) سرویس systemd برای بک‌اند

از لوکال:
```bash
scp deploy/vu-backend.service kongere:/etc/systemd/system/vu-backend.service
```

روی سرور:
```bash
ssh kongere
systemctl daemon-reload
systemctl enable vu-backend
systemctl start vu-backend
systemctl status vu-backend --no-pager
```
باید `active (running)` رو ببینی. برای دیدن لاگ زنده در آینده: `journalctl -u vu-backend -f`

---

## ۱۰) تنظیم nginx

از لوکال:
```bash
scp deploy/nginx-frontend.conf kongere:/etc/nginx/sites-available/promoter-frontend
scp deploy/nginx-api.conf kongere:/etc/nginx/sites-available/promoter-api
```

روی سرور:
```bash
ssh kongere
ln -sf /etc/nginx/sites-available/promoter-frontend /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/promoter-api /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
systemctl enable nginx
```
`nginx -t` باید بگه `syntax is ok` / `test is successful`. اگه اروری داد، همونجا نشونت می‌ده کدوم فایل و کدوم خط.

در این مرحله سایت روی `http://promoter.thevuteam.com` (بدون قفل، هنوز SSL نداریم) باید بالا باشه.

---

## ۱۱) گرفتن SSL (HTTPS) — سرور

```bash
certbot --nginx -d promoter.thevuteam.com -d api.promoter.thevuteam.com --redirect -m <ایمیل-خودت> --agree-tos
```

Certbot خودش کانفیگ nginx رو برای هر دو دامنه اصلاح می‌کنه، سرتیفیکیت می‌گیره، و ریدایرکت خودکار از HTTP به HTTPS رو اضافه می‌کنه. تمدید خودکار (هر ۹۰ روز) هم به‌صورت پیش‌فرض فعاله؛ برای اطمینان:
```bash
systemctl list-timers | grep certbot
```

---

## ۱۲) تست نهایی

```bash
curl -I https://promoter.thevuteam.com
curl -I https://api.promoter.thevuteam.com/docs
```
هر دو باید `200 OK` (یا خروجی معتبر) برگردونن. بعد توی مرورگر:
- `https://promoter.thevuteam.com` → باید فرم ورود پروموتر رو ببینی.
- ادمین با یوزرنیم/پسوردی که مرحله ۷ ساختی وارد بشه، یه ایونت بسازه و تست کنه.

---

## بروزرسانی‌های بعدی (هر وقت کد عوض شد)

**فرانت‌اند:**
```bash
cd frontend && npm run build
scp -r dist/. kongere:/var/www/promoter/frontend/
```

**بک‌اند:**
```bash
cd backend/app
tar --exclude='*.db' --exclude='*.sqlite3' --exclude='__pycache__' --exclude='uploads' -czf /tmp/backend.tar.gz .
scp /tmp/backend.tar.gz kongere:/tmp/
ssh kongere "tar -xzf /tmp/backend.tar.gz -C /var/www/promoter/backend && rm /tmp/backend.tar.gz && chown -R vuapp:vuapp /var/www/promoter/backend && systemctl restart vu-backend"
```
(دیتابیس و uploads دست نمی‌خورن چون exclude شدن — فقط کد آپدیت می‌شه.)

---

## نکات مهم که موقع بررسی پروژه پیدا شدن

- **`.env` دیتابیس‌های تستی**: توی پروژه چند فایل `.db`/`.sqlite3` اضافه و بلااستفاده هست (`backend/db.sqlite3`, `backend/app/database.db` و…) — فقط `backend/app/promoters.db` واقعیه. توی این راهنما اصلاً منتقل نمی‌شن (exclude شدن)، پس نیازی به دست‌زدن بهشون نبود؛ سرور از اول با دیتابیس خالی بالا میاد.
- **پروژه گیت نداره** (`git init` نشده) — برای همین انتقال فایل با `scp`/`tar` انجام شد، نه `git pull`. اگه بعداً بخوای از گیت برای دیپلوی استفاده کنی (توصیه می‌شه)، بگو تا راه‌اندازیش کنم.
- **`client_max_body_size`**: توی `nginx-api.conf` رو ۲۵ مگابایت گذاشتم چون پروموترها عکس آپلود می‌کنن؛ پیش‌فرض nginx ۱ مگابایته و آپلودها رو با خطای ۴۱۳ رد می‌کنه.
