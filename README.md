# VU Event Platform — promoter.thevuteam.com

پلتفرم مدیریت ایونت، پروموتر و گزارش‌های میدانی تیم VU (برای مشتریانی مثل BVT / باربیکن / **مهرام**).
**بک‌اند** FastAPI + SQLite، **فرانت‌اند** React (Vite) — یک SPA که هم سایت پروموترها و هم پنل ادمین است.

| آدرس | چیست |
|---|---|
| `https://promoter.thevuteam.com` | سایت پروموترها (فرم ایونت‌ها) و پنل ادمین در `/admin` |
| `https://api.promoter.thevuteam.com` | API (FastAPI پشت nginx) |

> **سرور production همین ماشین است** (`/var/www/promoter`)؛ هیچ استیجینگ جدایی وجود ندارد. قبل از هر تغییر روی دیتابیس یا دیپلوی، بکاپ بگیرید (`docs/OPERATIONS.md`).

## فهرست مستندات

| فایل | محتوا |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | ساختار پروژه، مدل‌های دیتابیس، نقش‌ها و مجوزها، فرانت‌اند |
| [`docs/MEHRAM.md`](docs/MEHRAM.md) | ماژول گزارش سوپرمارکت مهرام (بزرگ‌ترین بخش پروژه): فروشگاه‌ها، هفته‌ها، بازدید، نقشه، برنامه‌ی هفتگی، نوت، تایید گزارش، اکسل |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | تاریخچه‌ی کامل تغییرات و تصمیم‌ها (به ترتیب زمان) |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | دیپلوی، بکاپ، دیتابیس، تنظیمات سرور، همگام‌سازی با GitHub، داده‌های خصوصی |
| [`DEPLOY.md`](DEPLOY.md) | راهنمای اولیه‌ی نصب روی سرور تازه |
| [`CLAUDE.md`](CLAUDE.md) | قواعد کار برای دستیار هوش مصنوعی (و هر توسعه‌دهنده‌ی تازه‌وارد) |

## اجرا (توسعه)

```bash
# بک‌اند
cd backend/app && pip install -r requirements.txt
cp ../.env.example ../.env     # SECRET_KEY, ENCRYPTION_KEY, ... را پر کنید
uvicorn main:app --reload

# فرانت‌اند
cd frontend && npm install
cp src/components/MehramSupermarketReport/mehramStores.sample.js src/components/MehramSupermarketReport/mehramStores.js   # لیست فروشگاه‌ها: نمونه (داده‌ی واقعی در ریپو نیست)
npm run dev          # npm run build → dist/
```

## نکته‌ی مهم درباره‌ی این ریپو

این ریپو **عمومی** است؛ بنابراین این‌ها عمداً داخلش **نیست**: فایل‌های `.env`، دیتابیس‌ها، آپلودها، اکسل‌های مشتری (کد ملی دارند) و لیست واقعی فروشگاه‌ها (`mehramStores.js` — نام/تلفن/آدرس صاحبان مغازه). فقط یک نمونه با همان ساختار (`mehramStores.sample.js`) هست. راه بازگردانی داده‌ی واقعی در `docs/OPERATIONS.md` بخش «داده‌های خصوصی» آمده.
