# معماری پروژه

## پشته‌ی فنی
| بخش | فناوری |
|---|---|
| بک‌اند | Python 3.12، FastAPI، SQLAlchemy، SQLite (WAL)، uvicorn (۲ worker)، PyJWT، Fernet (رمزنگاری رمز نمایشی پروموتر) |
| فرانت‌اند | React 18 + Vite، Tailwind/CSS دستی، react-leaflet (نقشه)، recharts (نمودار)، @dnd-kit (drag & drop)، exceljs + file-saver (اکسل)، jsPDF (PDF)، axios، react-toastify، lucide-react |
| وب‌سرور | nginx (فرانت استاتیک + reverse proxy به `127.0.0.1:8000`)، certbot برای TLS |
| سرویس | systemd `vu-backend` (کاربر `vuapp`، `EnvironmentFile=/var/www/promoter/backend/.env`) |

## ساختار ریپو
```
backend/app/        کپی کد production بک‌اند (main.py ~۵۵۰۰ خط، models.py، auth.py، ...) — منبع حقیقت: /var/www/promoter/backend
frontend/src/
  App.jsx, EventForm.jsx, UserLogin.jsx, AdminLogin.jsx   سایت پروموتر (فرم ایونت، ورود)
  admin/AdminPanel.jsx                                    پنل ادمین (تب‌ها، پولینگ users/submissions)
  admin/tabs/*        Dashboard, Reports, Promoters, Map, Gallery, Charts, Tasks, Chat, Inventory, Settings, SetupCollection...
  admin/resources/    آرشیو پروموترها (RosterManager)، بج‌ها، مشتری‌ها
  admin/components/   RosterPickerModal، CityPicker، MultiSelectDropdown، RosterFilters، EventCalendarBar...
  admin/utils/        roleHelpers (نقش‌های روزانه)، dailyTeam (داشبورد روز‌به‌روز)، rosterFilters
  components/MehramSupermarketReport/   ماژول مهرام (docs/MEHRAM.md)
  components/BVTCigaretteMatch, BVTSamplingReport      ماژول‌های BVT
  components/crew/    صفحه‌ی نیروها (پروفایل، ایونت)
  utils/              roleUtils، progressUtils، iranCities، locationService
deploy/             قالب nginx/systemd برای نصب اولیه؛ deploy/live/ = تنظیمات واقعی فعلی سرور (خودکار آپدیت می‌شود)
scripts/            sync-to-github.sh، backup-private.sh
ai_tools/           ابزارهای جانبی (تحلیل صوت/پروموتر با Gemini؛ کلید فقط از env)
```

## نقش‌ها و مجوزها
- **پروموتر** (`Promoter`، `is_admin=False`): به ایونت‌های خودش، فرم گزارش و صفحه‌ی نیرو دسترسی دارد. نقش هر نفر **روزبه‌روز** است: `daily_roles` (JSON: روز → `promoter|supervisor|setup|collection|transport`) و `assigned_dates` (لیست روزها؛ خالی = همه‌ی روزهای ایونت). منطق: `frontend/src/admin/utils/roleHelpers.js` (`explicitDays`, `composeDays`, `normDay`) و `utils/roleUtils.js`.
- **ادمین** (`is_admin=True`): همه‌ی endpointهای `get_admin_user`.
- **مشتری پنل‌دار** (`admin_client='mahram'`، `is_admin=False`): فقط ایونت‌های مشتری خودش و فقط گزارش‌های تاییدشده؛ از `get_panel_user` + `_ensure_event_scope` عبور می‌کند.
- **حساب فقط‌مشاهده‌ی مهرام** (`team_name='mahram-viewer'`): فرم پروموتر را بدون مرحله‌ی سلفی می‌بیند و نمی‌تواند ثبت کند.
- مجوزهای خاص (در `auth.py` / `main.py`): تایید گزارش (`REPORT_APPROVER_USERNAMES`)، مدیریت ایونت (`EVENT_MANAGER_USERNAMES`)، حذف کامل گزارش (`REPORT_DELETER_USERNAMES`).

## مدل‌های دیتابیس (`models.py`)
`Promoter`, `Report`, `Task`, `Notification`, `LocationHistory`, `Attendance`, `Event`, `EventSubmission` (data / approved_data JSON)، `SetupSubmission`, `InventoryItem`, `ChatMessage`, `Client`, `PromoterRoster` (آرشیو؛ ستون‌های gender, badge_ids, **city**)، `Badge`, `EventTemplate`, `ChecklistPreset`, `BriefPreset`، و جدول‌های مهرام: `MehramPlan` (برنامه‌ی هفتگی)، `MehramDayPlan` (برنامه‌ی روزانه)، `MehramStoreNote` (نوت ادمین)، `MehramReportReview` (عدم تایید + دلیل)، `MehramReportApprover` (چه کسی تایید کرد).
- جدول‌های جدید با `Base.metadata.create_all` ساخته می‌شوند؛ ستون جدید روی جدول موجود با توابع `_migrate_*` در `models.py` (ALTER TABLE) اضافه می‌شود.
- گزارش‌های مهرام داخل `EventSubmission.data["<sectionId>_reports"]` (آرایه‌ی گزارش‌ها) و تماس‌ها در `..._calls` ذخیره می‌شوند؛ نسخه‌ی قابل‌نمایش برای مشتری در `approved_data`.

## بک‌اند — گروه‌بندی endpointها (`main.py`)
احراز هویت/کاربران · ایونت‌ها و فرم‌ساز · ثبت و مدیریت submissionها · آپلود (`/upload/image` با `X-Upload-Id` برای idempotency، `/upload/status/{id}`) · آرشیو پروموترها و بج‌ها · تسک/اعلان/چت/موجودی · نقشه‌ی زنده · آنالیتیکس · Google Sheets · و بخش مهرام:
`/admin/mehram/{visits,people,plans,plans/order,day-plans,notes}`، `/admin/events/{id}/mehram-reports/{approval,edit,reject,reset-review,delete}`، `/mehram/{my-plan,my-plan/order,visit-counts,store-notes,store-notes/{id}/respond}`. جزئیات در `docs/MEHRAM.md`.

## فرانت‌اند — نکات
- یک SPA؛ مسیرها: سایت پروموتر (`/:slug`)، `/admin`. `AdminPanel` هر ۱۰ ثانیه users و با تغییر ایونت submissionها را می‌گیرد؛ تب‌های سنگین (مهرام) داده‌ی خودشان را دارند.
- تاریخ ایونت‌ها رشته‌ی شمسی (`1405/08/04`) یا ISO است؛ مقایسه با `normDay` (ارقام فارسی/صفر ابتدایی/`-` یا `/`).
- نقشه: کاشی گوگل (`mt1.google.com`) با Leaflet.
