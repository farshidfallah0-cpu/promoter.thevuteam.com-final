# CLAUDE.md — قواعد کار روی این پروژه

(برای دستیار هوش مصنوعی یا هر توسعه‌دهنده‌ی تازه. توضیح کامل در `docs/`.)

## واقعیت‌های سرور
- **production همین ماشین است**: کد بک‌اند به‌صورت فلت در `/var/www/promoter/backend` (main.py, models.py, auth.py کنار `promoters.db`)، سرویس systemd با نام `vu-backend` (uvicorn، ۲ worker)، فرانت‌اند بیلدشده در `/var/www/promoter/frontend`، nginx جلوی هر دو.
- مسیر `backend/app/` داخل ریپو **کپی** کد production است (با `scripts/sync-to-github.sh` از روی سرور آپدیت می‌شود). منبع حقیقت بک‌اند = `/var/www/promoter/backend`.
- دیتابیس زنده است (SQLite، WAL): فقط با `file:...?mode=ro` یا sqlite backup API بخوان. قبل از هر نوشتن روی آن بکاپ بگیر (`promoters.db.bak-<دلیل>-<timestamp>`).

## قواعد دیپلوی (قرارداد با صاحب پروژه)
1. هر دیپلوی را کاربر صریح تایید می‌کند؛ تایید یک بار برای تغییرات بعدی تکرار نمی‌شود.
2. قبل از دیپلوی: بکاپ `/var/www/promoter/frontend` → `frontend-backup-<ts>` و بکاپ دیتابیس.
3. تغییر بک‌اند: اول روی **کپی دیتابیس** و uvicorn روی پورت دیگر تست کن، بعد `main.py` را جایگزین و `systemctl restart vu-backend` کن، بعد با توکن واقعی endpoint را چک کن.
4. فرانت‌اند: `cd frontend && npx vite build` → `rm -rf /var/www/promoter/frontend/assets && cp -a dist/. /var/www/promoter/frontend/`.
5. بعد از دیپلوی سلامت را چک کن (`curl` به سایت و `/docs` ی API، `systemctl is-active vu-backend nginx`) و بگو چه چیزی در مرورگر دیده نشده.

## قواعد دامنه (مهرام) — نباید نقض شوند
- مشتری مهرام (`mahram-admin`، و حساب `promoter-mahram`) **هرگز نباید بفهمد** «تایید گزارش» وجود دارد، **سلفی سردر** جمع می‌شود، پروموتر چه کسی است، «توضیحات فروشگاه»، نوت‌های ادمین و برنامه‌ی هفتگی. هر endpoint/نمایشی که حساب مشتری به آن می‌رسد فقط از داده‌ی تاییدشده (`approved_data`) می‌خواند و نشانه‌ای از تایید نشان نمی‌دهد.
- «بازدید» = یک فروشگاه در یک هفته (چند گزارش در یک هفته = یک بازدید). همه‌جا از `visitWeekCount` (فرانت) / منطق مشابه در `/mehram/visit-counts` استفاده شود.
- هفته‌ها شنبه ۰۰:۰۰ تا جمعه ۲۳:۵۹ به وقت تهران؛ مرز هفته با `weekStart()` / `_tehran_week_start()`.
- فروشگاه‌ها با `addedFrom` / `removedFrom` (epoch ms شروع هفته) از یک هفته به بعد اضافه/حذف می‌شوند؛ هفته‌های قبل هرگز دست نمی‌خورند. کد ملی هرگز وارد فایل فروشگاه‌ها نمی‌شود.
- حذف کامل گزارش فقط برای حساب‌های `REPORT_DELETER_USERNAMES`؛ تایید/عدم تایید فقط `REPORT_APPROVER_USERNAMES` (در `auth.py`/`main.py`).

## امنیت ریپو (عمومی است)
- هرگز `.env`، دیتابیس، آپلود، اکسل، کلید API یا رمز عبور commit نکن. اسکریپت `scripts/sync-to-github.sh` قبل از commit اسکن می‌کند و در صورت وجود چنین چیزی متوقف می‌شود.
- لیست واقعی فروشگاه‌ها در `.gitignore` است؛ نمونه: `mehramStores.sample.js`.

## سبک کد
- پیام‌ها و متن‌های UI فارسی و RTL؛ کامنت‌ها انگلیسی/فارسی کوتاه و فقط «چرا».
- فرانت‌اند بدون تست خودکار است؛ بعد از تغییر `npx vite build` باید بدون خطا تمام شود.
