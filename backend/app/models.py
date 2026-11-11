import os
import sqlite3
from sqlalchemy import Column, Integer, BigInteger, String, ForeignKey, Text, Boolean, Float, DateTime, create_engine, JSON, event, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from datetime import datetime

# Absolute path so the DB always resolves next to this file, regardless of the
# process's current working directory (a relative path here previously caused
# the app to silently create/use a different promoters.db depending on where
# uvicorn was launched from).
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(_BASE_DIR, 'promoters.db')
DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


@event.listens_for(engine, "connect")
def _set_sqlite_pragmas(dbapi_connection, connection_record):
    """
    Runs once per new DB connection (uvicorn's --workers 2 means multiple OS
    processes hitting this same file). Without WAL, SQLite's default
    rollback-journal mode locks the *entire* database file for the duration of
    any write, so concurrent requests from other workers/threads block or fail
    with "database is locked" under real traffic — this is what intermittently
    made the app look like it "can't connect" to the backend. WAL lets readers
    and a writer proceed concurrently; busy_timeout makes SQLite wait and retry
    a lock for 10s instead of raising immediately on the rare remaining conflict.
    Both are standard, non-destructive SQLite settings — no data is touched.
    """
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=10000")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()


SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

class Promoter(Base):
    __tablename__ = "promoters"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=False, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=True)
    role = Column(String, nullable=True)
    phone_number = Column(String, nullable=True)
    profile_picture = Column(String, nullable=True) # Base64 or URL
    team_name = Column(String, nullable=True)
    is_admin = Column(Boolean, default=False)  # Admin flag
    # Client-scoped panel account (e.g. 'mahram'): NOT an admin (is_admin stays
    # False, so every is_admin check keeps denying it); it may only use the admin
    # endpoints that explicitly allow it, and only for this client's events.
    admin_client = Column(String, nullable=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=True, index=True)
    plain_password = Column(String, nullable=True)  # Stored for admin visibility
    roster_id = Column(Integer, ForeignKey("promoter_roster.id"), nullable=True, index=True)
    assigned_dates = Column(String, nullable=True) # comma-separated dates
    daily_roles = Column(String, nullable=True) # JSON dictionary mapping date to role
    event = relationship("Event", foreign_keys=[event_id], backref="promoters")
    
    # فیلدهای جدید برای ردیابی موقعیت و وضعیت آنلاین
    last_latitude = Column(Float, nullable=True)
    last_longitude = Column(Float, nullable=True)
    last_location_time = Column(DateTime, nullable=True)
    last_seen = Column(DateTime, nullable=True)
    
    reports = relationship("Report", back_populates="owner")
    tasks = relationship("Task", foreign_keys="[Task.promoter_id]", back_populates="assigned_to")
    notifications = relationship("Notification", back_populates="user")
    location_history = relationship("LocationHistory", back_populates="promoter")

class Report(Base):
    __tablename__ = "reports"
    id = Column(Integer, primary_key=True, index=True)
    promoter_id = Column(Integer, ForeignKey("promoters.id"), index=True)
    
    date = Column(String)
    team_name = Column(String)
    promoter_name = Column(String)
    supervisor_name = Column(String)
    online_shop_status = Column(String, nullable=True)
    
    row_number = Column(String)
    time = Column(String)
    location = Column(String)
    address_floor = Column(String)
    store_name = Column(String)
    business_type = Column(String)
    seller_number = Column(String)
    online_shop_experience = Column(String)
    seller_role = Column(String)
    discount_amount = Column(String)
    transaction_amount = Column(String)
    note = Column(Text, nullable=True)
    
    # تصاویر گزارش
    images = Column(JSON, nullable=True)  # لیست URL تصاویر

    owner = relationship("Promoter", back_populates="reports")


class Task(Base):
    """تسک/وظیفه برای پروموترها"""
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    promoter_id = Column(Integer, ForeignKey("promoters.id"), nullable=True, index=True)  # null = for all
    team_name = Column(String, nullable=True)  # null = for all teams
    status = Column(String, default="pending")  # pending, in_progress, completed
    priority = Column(String, default="normal")  # low, normal, high, urgent
    due_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    created_by = Column(Integer, ForeignKey("promoters.id"))
    
    assigned_to = relationship("Promoter", foreign_keys=[promoter_id], back_populates="tasks")


class Notification(Base):
    """نوتیفیکیشن‌های داخل اپ"""
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("promoters.id"), nullable=True, index=True)  # null = broadcast
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String, default="info")  # info, success, warning, error, task
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    data = Column(JSON, nullable=True)  # extra data like task_id, report_id, etc.
    
    user = relationship("Promoter", back_populates="notifications")


class LocationHistory(Base):
    """تاریخچه مسیر حرکت پروموترها"""
    __tablename__ = "location_history"
    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=True, index=True)
    promoter_id = Column(Integer, ForeignKey("promoters.id"), index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)
    
    promoter = relationship("Promoter", back_populates="location_history")

class Attendance(Base):
    """ساعت ورود و خروج پروموترها"""
    __tablename__ = "attendance"
    id = Column(Integer, primary_key=True, index=True)
    promoter_id = Column(Integer, ForeignKey("promoters.id"), nullable=False, index=True)
    date = Column(String, nullable=False, index=True) # e.g. YYYY-MM-DD
    clock_in_time = Column(DateTime, nullable=False)
    clock_in_lat = Column(Float, nullable=True)
    clock_in_lon = Column(Float, nullable=True)
    clock_out_time = Column(DateTime, nullable=True)
    clock_out_lat = Column(Float, nullable=True)
    clock_out_lon = Column(Float, nullable=True)
    daily_notes = Column(Text, nullable=True)  # یادداشت روزانه پروموتر
    checklist = Column(JSON, nullable=True)    # چک‌لیست روزانه
    
    promoter = relationship("Promoter", backref="attendances")


class Event(Base):
    """Event model"""
    __tablename__ = "events"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False, index=True)
    client_name = Column(String, nullable=True)
    start_date = Column(String, nullable=True)
    start_time = Column(String, nullable=True)
    end_date = Column(String, nullable=True)
    end_time = Column(String, nullable=True)
    promoters_needed = Column(Integer, default=1)
    requires_setup = Column(Boolean, default=False)
    setup_count = Column(Integer, default=0)
    setup_date = Column(String, nullable=True)
    setup_time_in = Column(String, nullable=True)
    setup_time_out = Column(String, nullable=True)
    requires_collection = Column(Boolean, default=False)
    collection_count = Column(Integer, default=0)
    collection_date = Column(String, nullable=True)
    collection_time_in = Column(String, nullable=True)
    collection_time_out = Column(String, nullable=True)
    requires_supervisor = Column(Boolean, default=False)
    supervisor_count = Column(Integer, default=0)
    requires_transport = Column(Boolean, default=False)
    transport_count = Column(Integer, default=0)
    requires_sampling = Column(Boolean, default=False)
    sampling_count = Column(Integer, default=0)
    equipment_needed = Column(JSON, nullable=True)
    location = Column(String, nullable=True)
    report_location = Column(String, nullable=True)  # exact pinned location (Maps link) shown on the Mission Complete PDF
    report_location_image = Column(String, nullable=True)  # generated static-map snapshot of the pinned location, for the same PDF
    location_label = Column(String, nullable=True)  # English label for the location, used in the Mission Complete PDF text box
    report_photos = Column(JSON, nullable=True, default=list)  # up to 6 gallery photo URLs pinned for the Mission Complete PDF
    description = Column(Text, nullable=True)
    event_type = Column(String, nullable=True)
    custom_times = Column(JSON, nullable=True)
    fields = Column(JSON, nullable=False, default=[])
    setup_pre_fields = Column(JSON, nullable=False, default=[])
    setup_post_fields = Column(JSON, nullable=False, default=[])
    mobile_columns = Column(Integer, default=2)
    desktop_columns = Column(Integer, default=3)
    enable_voice = Column(Boolean, default=True)
    enable_chat = Column(Boolean, default=False)
    created_by = Column(Integer, ForeignKey("promoters.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=False)
    client_approved = Column(Boolean, default=False)
    is_archived = Column(Boolean, default=False)


class EventSubmission(Base):
    """پاسخ‌های ارسال‌شده به ایونت‌ها"""
    __tablename__ = "event_submissions"
    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), index=True)
    promoter_id = Column(Integer, ForeignKey("promoters.id"), nullable=True, index=True)
    data = Column(JSON, nullable=False)
    submitted_at = Column(DateTime, default=datetime.utcnow)
    first_submitted_at = Column(DateTime, nullable=True)  # زمان اولین ثبت، تغییر نمی‌کند
    # Snapshot of `data` as approved by one of our admins — the only version a
    # client-scoped account (Promoter.admin_client) ever sees. NULL = not approved.
    approved_data = Column(JSON, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    approved_by = Column(String, nullable=True)

class SetupSubmission(Base):
    """پاسخ‌های ارسال‌شده برای فرم‌های ست‌آپ"""
    __tablename__ = "setup_submissions"
    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), index=True)
    promoter_id = Column(Integer, ForeignKey("promoters.id"), nullable=True, index=True) # setup user
    phase = Column(String, nullable=False) # 'pre' or 'post'
    data = Column(JSON, nullable=False)
    submitted_at = Column(DateTime, default=datetime.utcnow)


class InventoryItem(Base):
    """انبارداری: تجهیزات تحویل داده شده به پروموترها"""
    __tablename__ = "inventory_items"
    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    promoter_id = Column(Integer, ForeignKey("promoters.id"), nullable=True, index=True)
    status = Column(String, default="pending")  # pending, received, returned, lost | in_stock, in_use, needs_repair
    assigned_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    # فیلدهای آرشیو کلی تجهیزات (global equipment archive)
    item_code = Column(String, nullable=True, index=True)  # کد اختصاصی تجهیز مثل EQ-001
    owner_type = Column(String, nullable=True, default="vu")  # "vu" یا "client"
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True)
    client_name = Column(String, nullable=True)  # cached name for quick access
    archive_item_id = Column(Integer, nullable=True) # Link to global equipment
    quantity = Column(Integer, default=1)  # تعداد کل واحدهای این تجهیز
    status_counts = Column(JSON, nullable=True)  # تفکیک تعداد بر اساس وضعیت، مثل {"in_stock": 5, "in_use": 2}

    assigned_to = relationship("Promoter", foreign_keys=[promoter_id], backref="inventory_items")
    owner_client = relationship("Client", foreign_keys=[client_id], backref="equipment_items")



class ChatMessage(Base):
    """پیامهای چت بین ادمین و پروموترها"""
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("events.id"), nullable=True, index=True)
    sender_id = Column(Integer, ForeignKey("promoters.id"), nullable=False, index=True)
    receiver_id = Column(Integer, ForeignKey("promoters.id"), nullable=False, index=True)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    sender = relationship("Promoter", foreign_keys=[sender_id])
    receiver = relationship("Promoter", foreign_keys=[receiver_id])


class Client(Base):
    """جدول کلاینت‌های حقیقی و برندها"""
    __tablename__ = "clients"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False, index=True)
    logo_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class PromoterRoster(Base):
    """آرشیو کامل پروموترها، مستقل از هر ایونت خاص"""
    __tablename__ = "promoter_roster"
    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    phone_number = Column(String, nullable=True)
    username = Column(String, nullable=True)        # پیشنهادی/پیش‌فرض - یکتا نیست
    plain_password = Column(String, nullable=True)   # پیشنهادی/پیش‌فرض، رمزنگاری‌شده
    certificates = Column(JSON, nullable=False, default=[])  # لیست رشته‌ای گواهی‌ها/مجوزها
    profile_picture = Column(String, nullable=True)  # URL, propagated to every linked Promoter row on change
    notes = Column(Text, nullable=True)
    worked_days_override = Column(Integer, nullable=True)  # manual total worked days; overrides the count derived from submissions
    gender = Column(String, nullable=True)  # 'male' | 'female' | NULL (not set yet)
    badge_ids = Column(JSON, nullable=True)  # ids of Badge rows picked for this promoter
    city = Column(String, nullable=True)  # the promoter's city (free text, picked from the list of Iranian cities)
    created_at = Column(DateTime, default=datetime.utcnow)


class Badge(Base):
    """آرشیو بج‌ها/گواهی‌ها — یک‌بار تعریف می‌شوند و روی کارت پروموترها انتخاب می‌شوند"""
    __tablename__ = "badges"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    image_url = Column(String, nullable=True)
    color = Column(String, nullable=True)  # hex accent used when there is no image
    created_at = Column(DateTime, default=datetime.utcnow)


class EventTemplate(Base):
    """قالب‌های آماده سفارشی که توسط کاربر ساخته و ذخیره می‌شوند"""
    __tablename__ = "event_templates"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True, index=True)
    description = Column(Text, nullable=True)
    sections = Column(JSON, nullable=False, default=[])
    created_at = Column(DateTime, default=datetime.utcnow)

class ChecklistPreset(Base):
    """قالب‌های آماده برای چک‌لیست که توسط ادمین‌ها ساخته می‌شوند"""
    __tablename__ = "checklist_presets"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False, unique=True, index=True)
    items = Column(JSON, nullable=False, default=[])
    created_at = Column(DateTime, default=datetime.utcnow)

class MehramPlan(Base):
    """Weekly visit plan: which promoter goes to which Mehram store in a given week.
    One promoter per store per week. `person_key` = 'r:<roster_id>' (stable across
    events) or 'p:<promoter_id>' for a promoter row with no roster entry."""
    __tablename__ = "mehram_plans"
    __table_args__ = (UniqueConstraint('client', 'week_start', 'store_id', name='uq_mehram_plan_store_week'),)
    id = Column(Integer, primary_key=True, index=True)
    client = Column(String, nullable=False, index=True)
    week_start = Column(BigInteger, nullable=False, index=True)  # epoch ms of Saturday 00:00 Tehran
    store_id = Column(String, nullable=False)
    person_key = Column(String, nullable=False, index=True)
    person_name = Column(String, nullable=True)
    position = Column(Integer, nullable=True)  # visiting order within the person's week (NULL = old rows, ordered by id)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class MehramDayPlan(Base):
    """Daily visit plan: which promoter goes to which Mehram store on a given day (for multi-day
    events). `day` = epoch ms of that day's 00:00 Tehran. One promoter per store per day; the same
    store may be planned on several days. Independent of the weekly MehramPlan."""
    __tablename__ = "mehram_day_plans"
    __table_args__ = (UniqueConstraint('client', 'day', 'store_id', name='uq_mehram_day_plan_store_day'),)
    id = Column(Integer, primary_key=True, index=True)
    client = Column(String, nullable=False, index=True)
    day = Column(BigInteger, nullable=False, index=True)
    store_id = Column(String, nullable=False)
    person_key = Column(String, nullable=False, index=True)
    person_name = Column(String, nullable=True)
    position = Column(Integer, nullable=True)  # visiting order within the person's day
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class MehramStoreNote(Base):
    """A note our admins leave on one Mehram store for the promoters who visit it. The promoter answers it:
    'accepted' (تایید) or 'declined' (عدم تایید, with a reason). Internal: never exposed to client accounts."""
    __tablename__ = "mehram_store_notes"
    id = Column(Integer, primary_key=True, index=True)
    client = Column(String, nullable=False, index=True)
    store_id = Column(String, nullable=False, index=True)
    text = Column(Text, nullable=False)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, nullable=False, default='pending')  # pending | accepted | declined
    response_reason = Column(Text, nullable=True)
    responded_by = Column(String, nullable=True)
    responded_at = Column(DateTime, nullable=True)


class MehramReportReview(Base):
    """An admin's «عدم تایید» of one supermarket report, with the reason — so the other admins see why
    it is not shown to the client. Never exposed to client accounts or promoters."""
    __tablename__ = "mehram_report_reviews"
    __table_args__ = (UniqueConstraint('submission_id', 'report_id', name='uq_mehram_review_report'),)
    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, nullable=False, index=True)
    report_id = Column(String, nullable=False)
    status = Column(String, nullable=False, default='rejected')
    reason = Column(Text, nullable=True)
    reviewed_by = Column(String, nullable=True)
    reviewed_at = Column(DateTime, default=datetime.utcnow)


class MehramReportApprover(Base):
    """Which admin approved one supermarket report, and when. Kept out of EventSubmission.approved_data
    (the snapshot the client receives) so a client account can never see that approval exists."""
    __tablename__ = "mehram_report_approvals"
    __table_args__ = (UniqueConstraint('submission_id', 'report_id', name='uq_mehram_approval_report'),)
    id = Column(Integer, primary_key=True, index=True)
    submission_id = Column(Integer, nullable=False, index=True)
    report_id = Column(String, nullable=False)
    approved_by = Column(String, nullable=True)
    approved_at = Column(DateTime, default=datetime.utcnow)


class BriefPreset(Base):
    """قالب‌های آماده برای بریف رویداد که توسط ادمین‌ها ساخته می‌شوند"""
    __tablename__ = "brief_presets"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False, unique=True, index=True)
    text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

def _migrate_events_table():
    """Add columns to an already-existing events table (create_all only creates missing tables, not missing columns)."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cols = [row[1] for row in cur.execute("PRAGMA table_info(events)")]
    migrations = {
        'setup_count': "ALTER TABLE events ADD COLUMN setup_count INTEGER DEFAULT 0",
        'requires_collection': "ALTER TABLE events ADD COLUMN requires_collection BOOLEAN DEFAULT 0",
        'collection_count': "ALTER TABLE events ADD COLUMN collection_count INTEGER DEFAULT 0",
        'requires_supervisor': "ALTER TABLE events ADD COLUMN requires_supervisor BOOLEAN DEFAULT 0",
        'supervisor_count': "ALTER TABLE events ADD COLUMN supervisor_count INTEGER DEFAULT 0",
        'requires_transport': "ALTER TABLE events ADD COLUMN requires_transport BOOLEAN DEFAULT 0",
        'transport_count': "ALTER TABLE events ADD COLUMN transport_count INTEGER DEFAULT 0",
        'requires_sampling': "ALTER TABLE events ADD COLUMN requires_sampling BOOLEAN DEFAULT 0",
        'sampling_count': "ALTER TABLE events ADD COLUMN sampling_count INTEGER DEFAULT 0",
        'setup_date': "ALTER TABLE events ADD COLUMN setup_date TEXT",
        'setup_time_in': "ALTER TABLE events ADD COLUMN setup_time_in TEXT",
        'setup_time_out': "ALTER TABLE events ADD COLUMN setup_time_out TEXT",
        'collection_date': "ALTER TABLE events ADD COLUMN collection_date TEXT",
        'collection_time_in': "ALTER TABLE events ADD COLUMN collection_time_in TEXT",
        'collection_time_out': "ALTER TABLE events ADD COLUMN collection_time_out TEXT",
        'location': "ALTER TABLE events ADD COLUMN location TEXT",
        'description': "ALTER TABLE events ADD COLUMN description TEXT",
        'event_type': "ALTER TABLE events ADD COLUMN event_type TEXT",
        'custom_times': "ALTER TABLE events ADD COLUMN custom_times JSON",
        'report_location': "ALTER TABLE events ADD COLUMN report_location TEXT",
        'report_location_image': "ALTER TABLE events ADD COLUMN report_location_image TEXT",
        'location_label': "ALTER TABLE events ADD COLUMN location_label TEXT",
        'report_photos': "ALTER TABLE events ADD COLUMN report_photos JSON",
        'client_approved': "ALTER TABLE events ADD COLUMN client_approved BOOLEAN DEFAULT 0",
    }
    for col, ddl in migrations.items():
        if col not in cols:
            cur.execute(ddl)
    conn.commit()
    conn.close()


def _migrate_promoters_table():
    """Add roster_id to an already-existing promoters table (new table PromoterRoster itself is handled by create_all)."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cols = [row[1] for row in cur.execute("PRAGMA table_info(promoters)")]
    if 'roster_id' not in cols:
        cur.execute("ALTER TABLE promoters ADD COLUMN roster_id INTEGER")
    if 'daily_roles' not in cols:
        cur.execute("ALTER TABLE promoters ADD COLUMN daily_roles TEXT")
    if 'admin_client' not in cols:
        try:
            cur.execute("ALTER TABLE promoters ADD COLUMN admin_client TEXT")
        except sqlite3.OperationalError as e:  # the other uvicorn worker got there first
            if 'duplicate column' not in str(e):
                raise
    conn.commit()
    conn.close()


def _migrate_promoter_roster_table():
    """Add profile_picture to an already-existing promoter_roster table."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cols = [row[1] for row in cur.execute("PRAGMA table_info(promoter_roster)")]
    if 'profile_picture' not in cols:
        cur.execute("ALTER TABLE promoter_roster ADD COLUMN profile_picture TEXT")
    if 'worked_days_override' not in cols:
        cur.execute("ALTER TABLE promoter_roster ADD COLUMN worked_days_override INTEGER")
    for col, ddl in (('gender', "ALTER TABLE promoter_roster ADD COLUMN gender TEXT"),
                     ('badge_ids', "ALTER TABLE promoter_roster ADD COLUMN badge_ids TEXT"),
                     ('city', "ALTER TABLE promoter_roster ADD COLUMN city TEXT")):
        if col not in cols:
            try:
                cur.execute(ddl)
            except sqlite3.OperationalError as e:  # the other uvicorn worker got there first
                if 'duplicate column' not in str(e):
                    raise
    conn.commit()
    conn.close()


def _migrate_clients_table():
    """Add logo_url to an already-existing clients table."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cols = [row[1] for row in cur.execute("PRAGMA table_info(clients)")]
    if 'logo_url' not in cols:
        cur.execute("ALTER TABLE clients ADD COLUMN logo_url TEXT")
    conn.commit()
    conn.close()


def _migrate_mehram_plans_table():
    """Add position (visiting order) to an already-existing mehram_plans table."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cols = [row[1] for row in cur.execute("PRAGMA table_info(mehram_plans)")]
    if cols and 'position' not in cols:
        try:
            cur.execute("ALTER TABLE mehram_plans ADD COLUMN position INTEGER")
        except sqlite3.OperationalError as e:  # the other uvicorn worker got there first
            if 'duplicate column' not in str(e):
                raise
    conn.commit()
    conn.close()


def _migrate_attendance_table():
    """Add daily_notes/checklist to an already-existing attendance table."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cols = [row[1] for row in cur.execute("PRAGMA table_info(attendance)")]
    migrations = {
        'daily_notes': "ALTER TABLE attendance ADD COLUMN daily_notes TEXT",
        'checklist': "ALTER TABLE attendance ADD COLUMN checklist JSON",
    }
    for col, ddl in migrations.items():
        if col not in cols:
            cur.execute(ddl)
    conn.commit()
    conn.close()


def _migrate_event_submissions_table():
    """Add first_submitted_at to existing event_submissions rows."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cols = [row[1] for row in cur.execute("PRAGMA table_info(event_submissions)")]
    if 'first_submitted_at' not in cols:
        cur.execute("ALTER TABLE event_submissions ADD COLUMN first_submitted_at DATETIME")
        # Backfill: for existing rows, set first_submitted_at = submitted_at
        cur.execute("UPDATE event_submissions SET first_submitted_at = submitted_at WHERE first_submitted_at IS NULL")
    for col, ddl in {
        'approved_data': "ALTER TABLE event_submissions ADD COLUMN approved_data JSON",
        'approved_at': "ALTER TABLE event_submissions ADD COLUMN approved_at DATETIME",
        'approved_by': "ALTER TABLE event_submissions ADD COLUMN approved_by TEXT",
    }.items():
        if col not in cols:
            try:
                cur.execute(ddl)
            except sqlite3.OperationalError as e:  # the other uvicorn worker got there first
                if 'duplicate column' not in str(e):
                    raise
    conn.commit()
    conn.close()


def _migrate_inventory_items_table():
    """Add new columns to inventory_items for global equipment archive."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cols = [row[1] for row in cur.execute("PRAGMA table_info(inventory_items)")]
    migrations = {
        'item_code': "ALTER TABLE inventory_items ADD COLUMN item_code TEXT",
        'owner_type': "ALTER TABLE inventory_items ADD COLUMN owner_type TEXT DEFAULT 'vu'",
        'client_id': "ALTER TABLE inventory_items ADD COLUMN client_id INTEGER",
        'client_name': "ALTER TABLE inventory_items ADD COLUMN client_name TEXT",
        'archive_item_id': "ALTER TABLE inventory_items ADD COLUMN archive_item_id INTEGER",
        'quantity': "ALTER TABLE inventory_items ADD COLUMN quantity INTEGER DEFAULT 1",
        'status_counts': "ALTER TABLE inventory_items ADD COLUMN status_counts TEXT",
    }
    for col, ddl in migrations.items():
        if col not in cols:
            cur.execute(ddl)
    conn.commit()
    conn.close()


def _ensure_indexes():
    """
    Add indexes on foreign-key columns that get filtered on constantly (every
    "submissions for this event", "reports for this promoter", etc. query) but
    were missing one — meaning every such lookup did a full table scan. Like the
    other _migrate_* helpers, create_all() only sets up indexes for tables it
    creates fresh, so already-existing production tables need this explicit,
    idempotent backfill. CREATE INDEX IF NOT EXISTS never touches existing rows.
    """
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    indexes = {
        'ix_promoters_event_id': "CREATE INDEX IF NOT EXISTS ix_promoters_event_id ON promoters(event_id)",
        'ix_promoters_roster_id': "CREATE INDEX IF NOT EXISTS ix_promoters_roster_id ON promoters(roster_id)",
        'ix_reports_promoter_id': "CREATE INDEX IF NOT EXISTS ix_reports_promoter_id ON reports(promoter_id)",
        'ix_tasks_event_id': "CREATE INDEX IF NOT EXISTS ix_tasks_event_id ON tasks(event_id)",
        'ix_tasks_promoter_id': "CREATE INDEX IF NOT EXISTS ix_tasks_promoter_id ON tasks(promoter_id)",
        'ix_notifications_event_id': "CREATE INDEX IF NOT EXISTS ix_notifications_event_id ON notifications(event_id)",
        'ix_notifications_user_id': "CREATE INDEX IF NOT EXISTS ix_notifications_user_id ON notifications(user_id)",
        'ix_location_history_event_id': "CREATE INDEX IF NOT EXISTS ix_location_history_event_id ON location_history(event_id)",
        'ix_location_history_promoter_id': "CREATE INDEX IF NOT EXISTS ix_location_history_promoter_id ON location_history(promoter_id)",
        'ix_attendance_promoter_id': "CREATE INDEX IF NOT EXISTS ix_attendance_promoter_id ON attendance(promoter_id)",
        'ix_event_submissions_event_id': "CREATE INDEX IF NOT EXISTS ix_event_submissions_event_id ON event_submissions(event_id)",
        'ix_event_submissions_promoter_id': "CREATE INDEX IF NOT EXISTS ix_event_submissions_promoter_id ON event_submissions(promoter_id)",
        'ix_setup_submissions_event_id': "CREATE INDEX IF NOT EXISTS ix_setup_submissions_event_id ON setup_submissions(event_id)",
        'ix_setup_submissions_promoter_id': "CREATE INDEX IF NOT EXISTS ix_setup_submissions_promoter_id ON setup_submissions(promoter_id)",
        'ix_inventory_items_event_id': "CREATE INDEX IF NOT EXISTS ix_inventory_items_event_id ON inventory_items(event_id)",
        'ix_inventory_items_promoter_id': "CREATE INDEX IF NOT EXISTS ix_inventory_items_promoter_id ON inventory_items(promoter_id)",
        'ix_chat_messages_event_id': "CREATE INDEX IF NOT EXISTS ix_chat_messages_event_id ON chat_messages(event_id)",
        'ix_chat_messages_sender_id': "CREATE INDEX IF NOT EXISTS ix_chat_messages_sender_id ON chat_messages(sender_id)",
        'ix_chat_messages_receiver_id': "CREATE INDEX IF NOT EXISTS ix_chat_messages_receiver_id ON chat_messages(receiver_id)",
        # Composite: the single most common lookup pattern — submissions belonging
        # to one promoter within one event (today's report, per-promoter history).
        'ix_event_submissions_event_promoter': "CREATE INDEX IF NOT EXISTS ix_event_submissions_event_promoter ON event_submissions(event_id, promoter_id)",
    }
    for name, ddl in indexes.items():
        cur.execute(ddl)
    conn.commit()
    conn.close()


def init_db():
    # uvicorn runs several workers that all start at once: two can race to CREATE
    # the same new table. The loser just retries — create_all then sees it exists.
    from sqlalchemy.exc import OperationalError
    for attempt in range(3):
        try:
            Base.metadata.create_all(bind=engine)
            break
        except OperationalError as e:
            if 'already exists' not in str(e) or attempt == 2:
                raise
    _migrate_events_table()
    _migrate_promoters_table()
    _migrate_promoter_roster_table()
    _migrate_clients_table()
    _migrate_attendance_table()
    _migrate_mehram_plans_table()
    _migrate_inventory_items_table()
    _migrate_event_submissions_table()
    _ensure_indexes()

