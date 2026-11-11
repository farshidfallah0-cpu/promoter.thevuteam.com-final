import os
import sys

# Add the app directory to sys.path to allow absolute imports from within the app module
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, Depends, HTTPException, status, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from models import init_db, SessionLocal, Promoter, Report, Task, Notification, LocationHistory, Event, EventTemplate, EventSubmission, InventoryItem, ChatMessage, Attendance, Client, PromoterRoster, Badge, ChecklistPreset, BriefPreset, MehramPlan, MehramDayPlan, MehramStoreNote, MehramReportReview, MehramReportApprover, DB_PATH
from sqlalchemy.orm import joinedload
from auth import authenticate_user, create_access_token, get_password_hash, get_current_user, encrypt_value, decrypt_value, can_manage_events, client_scope, can_approve_reports
import shutil
import uuid
import base64
from sheets_client import SheetsClient
from dotenv import load_dotenv
import logging
from logging.handlers import RotatingFileHandler
import time
from fastapi.responses import JSONResponse
from fastapi import Request
import traceback
import re
from urllib.parse import urlparse, parse_qs
from typing import Optional, List, Dict
import io
import math
import requests
from PIL import Image, ImageDraw, ImageFont
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import sys

os.makedirs("logs", exist_ok=True)
logger = logging.getLogger("vu_event")
logger.setLevel(logging.INFO)

formatter = logging.Formatter("%(asctime)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s")
file_handler = RotatingFileHandler("logs/app.log", maxBytes=5*1024*1024, backupCount=5, encoding="utf-8")
file_handler.setFormatter(formatter)
logger.addHandler(file_handler)

console_handler = logging.StreamHandler()
console_handler.setFormatter(formatter)
logger.addHandler(console_handler)

# Override uvicorn loggers to use our formatting
logging.getLogger("uvicorn.error").handlers = [console_handler, file_handler]
logging.getLogger("uvicorn.access").handlers = [console_handler, file_handler]

load_dotenv()

TEHRAN_TZ = timezone(timedelta(hours=3, minutes=30))

# How long after an event's configured end_time a promoter's actions still count
# as the shift that's wrapping up, before everything resets for the next day.
# Mirrored in frontend/src/EventForm.jsx as SHIFT_CONTINUITY_GRACE_MS; keep both
# in sync.
SHIFT_CONTINUITY_GRACE = timedelta(hours=4)


def _parse_hm(raw):
    """'HH:MM' -> (hour, minute), or None if missing/unparsable."""
    try:
        h, m = raw.split(':')
        return int(h), int(m)
    except Exception:
        return None


def _shift_cutover(event, shift_start_utc):
    """
    The UTC instant after which a submission row started at `shift_start_utc`
    (its first_submitted_at) is considered over — the event's configured
    end_time, in Tehran local time, plus SHIFT_CONTINUITY_GRACE. If end_time
    would otherwise land at or before the shift's own start (an event that
    starts in the evening and ends after midnight, e.g. 20:00 -> 00:00), it's
    rolled forward a day so it lands on the following calendar day instead —
    matching how the shift is actually experienced. Falls back to end of the
    shift's calendar day when the event has no end_time configured.
    """
    shift_start_local = shift_start_utc.astimezone(TEHRAN_TZ)
    hm = _parse_hm(event.end_time) if event and event.end_time else None
    if hm is None:
        end_local = shift_start_local.replace(hour=23, minute=59, second=59, microsecond=0)
    else:
        h, m = hm
        end_local = shift_start_local.replace(hour=h, minute=m, second=0, microsecond=0)
        if end_local <= shift_start_local:
            end_local += timedelta(days=1)
    return end_local + SHIFT_CONTINUITY_GRACE


def _is_same_shift(shift_start_utc, now_utc, event=None):
    """
    Whether `now_utc` still falls within the shift that started at
    `shift_start_utc` — which must be the submission row's first_submitted_at
    (its original, never-edited creation time), NOT its last-edit timestamp.
    That distinction is what fixes a real bug this used to have: anchoring on
    the last edit meant that once one edit landed after Tehran midnight (e.g.
    a 00:15 check-out photo), the row's "last edited" date rolled onto the
    next calendar day — so the *next real day's* shift, hours later, was
    still seen as "the same calendar day" and got silently merged onto (and
    pre-filled from) the previous day's row instead of starting fresh.

    Anchoring on the immutable first_submitted_at and comparing against a
    fixed cutover (the event's end_time + SHIFT_CONTINUITY_GRACE, computed
    once from that fixed start) means every edit made during the actual
    ongoing shift — including ones just after midnight — still attaches to
    the same row, while the next day's shift, whenever it truly begins,
    always starts a clean new row.
    """
    if shift_start_utc.tzinfo is None:
        shift_start_utc = shift_start_utc.replace(tzinfo=timezone.utc)
    if now_utc.tzinfo is None:
        now_utc = now_utc.replace(tzinfo=timezone.utc)
    return now_utc.astimezone(TEHRAN_TZ) < _shift_cutover(event, shift_start_utc)


# Promoter title bands by total worked days (distinct days with a submitted
# daily report): Rookie 0-29, Pro 30-79, Expert 80-149, Elite 150+.
_TITLE_BANDS = [("Rookie", 0), ("Pro", 30), ("Expert", 80), ("Elite", 150)]


def _compute_gamification(db, promoter_ids, total_days_override=None):
    """Title based on distinct days a promoter filled in their daily report —
    each EventSubmission row already represents exactly one calendar day
    (the /events/{slug}/submit endpoint upserts onto the same day's row), so
    counting rows counts worked days directly without needing a separate
    attendance/clock table. Also reports the most recent such day."""
    if not promoter_ids:
        return None

    q = db.query(EventSubmission).filter(EventSubmission.promoter_id.in_(promoter_ids))
    total_days = total_days_override if total_days_override is not None else q.count()
    last_at = db.query(func.max(func.coalesce(EventSubmission.first_submitted_at, EventSubmission.submitted_at))).filter(
        EventSubmission.promoter_id.in_(promoter_ids)
    ).scalar()

    idx = max(i for i, (_, start) in enumerate(_TITLE_BANDS) if total_days >= start)
    title, start_days = _TITLE_BANDS[idx]
    nxt = _TITLE_BANDS[idx + 1] if idx + 1 < len(_TITLE_BANDS) else None

    return {
        "total_days": total_days,
        "title": title,
        "title_start_days": start_days,
        "next_title": nxt[0] if nxt else None,
        "next_title_days": nxt[1] if nxt else None,
        "days_into_level": total_days - start_days,
        "credits_to_next_level": (nxt[1] - start_days) if nxt else None,
        "last_work_at": (last_at.isoformat() + 'Z') if last_at else None,
    }

init_db()

# Absolute path so uploads always land next to this file regardless of the
# process's current working directory (mirrors the DATABASE_URL fix in models.py).
UPLOADS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp", "heic", "heif"}
ALLOWED_VOICE_EXTENSIONS = {"webm", "mp3", "wav", "m4a", "ogg"}
# 20MB, not 15 — client now compresses images before upload (including iPhone HEIC
# photos, previously sent as-is), so this is mostly a safety net for whatever slips
# through uncompressed rather than the everyday ceiling it used to be.
MAX_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024

# Public base URL uploaded files are served from. Was previously hardcoded to the
# production domain, which silently broke image previews in any other environment
# (local dev, staging) since the file was saved locally but the returned URL pointed
# at production. Set PUBLIC_BASE_URL in .env per environment.
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")

# Some mobile browsers (notably iOS Safari photo-picker in a few OS versions) hand
# over a file with no usable extension in its name. Rather than hard-rejecting those
# uploads, fall back to the extension implied by the browser-reported content type.
_MIME_EXT_FALLBACK = {
    "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
    "image/gif": "gif", "image/webp": "webp",
    "image/heic": "heic", "image/heif": "heif",
}


def _safe_extension(filename: str, allowed: set[str], default: str | None = None, content_type: str | None = None) -> str:
    """Return a validated lowercase extension from `allowed`, or raise 400."""
    ext = filename.rsplit(".", 1)[-1].lower() if filename and "." in filename else ""
    if ext not in allowed:
        mime_ext = _MIME_EXT_FALLBACK.get((content_type or "").lower())
        if mime_ext and mime_ext in allowed:
            return mime_ext
        if default and not filename:
            return default
        raise HTTPException(status_code=400, detail=f"Unsupported file type: .{ext or '?'}")
    return ext


async def _save_upload(file: UploadFile, allowed: set[str], prefix: str = "") -> str:
    ext = _safe_extension(file.filename, allowed, content_type=file.content_type)
    file_name = f"{prefix}{uuid.uuid4()}.{ext}"
    file_path = os.path.join(UPLOADS_DIR, file_name)

    size = 0
    with open(file_path, "wb") as buffer:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_SIZE_BYTES:
                buffer.close()
                os.remove(file_path)
                raise HTTPException(status_code=413, detail="File too large")
            buffer.write(chunk)
    return file_name


# ── Location snapshot (Mission Completed PDF "exact location" box) ──────────
# Composites a small static-map image server-side from raw map tiles (no API
# key needed, unlike Google/Mapbox static map APIs) so the admin can pin an
# exact spot in EventPanel and have it show up as a real image in the PDF
# rather than just a pasted link.
_OSM_TILE_SIZE = 256
_OSM_TILE_HEADERS = {"User-Agent": "VU-Event-Platform/1.0 (+https://thevuteam.com)"}
# Plain OpenStreetMap raster tiles: label-free keyless alternatives (CartoDB's
# basemaps now gate behind an API key; Wikimedia's tile set serves blank tiles
# for large swaths outside its cached region) aren't reliably available
# without a key. The local-language street/POI labels this bakes in are a
# real limitation for an all-English PDF, so the caption bar drawn below (a
# short English place name from reverse geocoding) carries the actual
# readable location text instead of relying on the map's own labels.
_MAP_TILE_URL = "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
_TILE_FETCH_TIMEOUT = 10
_TILE_FETCH_WORKERS = 8


def _latlng_to_world_pixel(lat: float, lng: float, zoom: int) -> tuple[float, float]:
    lat_rad = math.radians(lat)
    n = 2.0 ** zoom
    x = (lng + 180.0) / 360.0 * n * _OSM_TILE_SIZE
    y = (1.0 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi) / 2.0 * n * _OSM_TILE_SIZE
    return x, y


def _fetch_general_address_en(lat: float, lng: float) -> str:
    """Reverse-geocodes to a short, general, English place name (district/city
    level, not a street address) to caption the snapshot with — the PDF is an
    English document and a full local-language address doesn't belong in it."""
    try:
        resp = requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={"lat": lat, "lon": lng, "format": "json", "accept-language": "en", "zoom": 12},
            headers=_OSM_TILE_HEADERS, timeout=5,
        )
        addr = resp.json().get("address", {})
        parts = [
            addr.get("suburb") or addr.get("neighbourhood") or addr.get("city_district"),
            addr.get("city") or addr.get("town") or addr.get("state"),
            addr.get("country"),
        ]
        return ", ".join(p for p in parts if p)
    except Exception:
        return ""


def _generate_location_snapshot(lat: float, lng: float, out_width: int = 1310, out_height: int = 346, zoom: int = 14) -> bytes:
    n_tiles = 2 ** zoom
    center_x, center_y = _latlng_to_world_pixel(lat, lng, zoom)
    left = center_x - out_width / 2
    top = center_y - out_height / 2

    first_tx, first_ty = int(left // _OSM_TILE_SIZE), int(top // _OSM_TILE_SIZE)
    last_tx = int((left + out_width) // _OSM_TILE_SIZE)
    last_ty = int((top + out_height) // _OSM_TILE_SIZE)

    canvas = Image.new("RGB", ((last_tx - first_tx + 1) * _OSM_TILE_SIZE, (last_ty - first_ty + 1) * _OSM_TILE_SIZE), (222, 216, 200))

    def _fetch_tile(coords):
        tx, ty = coords
        if ty < 0 or ty >= n_tiles:
            return coords, None
        wrapped_x = tx % n_tiles
        try:
            resp = requests.get(_MAP_TILE_URL.format(z=zoom, x=wrapped_x, y=ty), headers=_OSM_TILE_HEADERS, timeout=_TILE_FETCH_TIMEOUT)
            if resp.status_code == 200:
                return coords, Image.open(io.BytesIO(resp.content)).convert("RGB")
        except Exception:
            pass
        return coords, None

    tile_coords = [(tx, ty) for tx in range(first_tx, last_tx + 1) for ty in range(first_ty, last_ty + 1)]
    with ThreadPoolExecutor(max_workers=_TILE_FETCH_WORKERS) as pool:
        for (tx, ty), tile_img in pool.map(_fetch_tile, tile_coords):
            if tile_img is not None:
                canvas.paste(tile_img, ((tx - first_tx) * _OSM_TILE_SIZE, (ty - first_ty) * _OSM_TILE_SIZE))

    crop_left = int(left - first_tx * _OSM_TILE_SIZE)
    crop_top = int(top - first_ty * _OSM_TILE_SIZE)
    snapshot = canvas.crop((crop_left, crop_top, crop_left + out_width, crop_top + out_height))

    # Draw a simple map pin dead-center, matching the pin markers already in the PDF's background art.
    draw = ImageDraw.Draw(snapshot)
    cx, cy = out_width // 2, out_height // 2
    r = 20
    bulb_cy = cy - r
    draw.polygon([(cx - r * 0.62, bulb_cy + r * 0.55), (cx + r * 0.62, bulb_cy + r * 0.55), (cx, cy + 6)], fill=(217, 45, 32))
    draw.ellipse((cx - r, bulb_cy - r, cx + r, bulb_cy + r), fill=(217, 45, 32), outline=(255, 255, 255), width=4)
    draw.ellipse((cx - 7, bulb_cy - 7, cx + 7, bulb_cy + 7), fill=(255, 255, 255))

    # Caption bar: a short, general English place name — never the map's own
    # (label-free, so this is the only text on it) and never a street-level
    # address, matching how general the rest of this all-English PDF is.
    address_en = _fetch_general_address_en(lat, lng)
    if address_en:
        bar_h = 34
        overlay = Image.new("RGBA", (out_width, bar_h), (10, 10, 10, 150))
        snapshot.paste(Image.alpha_composite(snapshot.crop((0, out_height - bar_h, out_width, out_height)).convert("RGBA"), overlay).convert("RGB"), (0, out_height - bar_h))
        draw = ImageDraw.Draw(snapshot)
        # load_default(size=...) needs a FreeType-enabled Pillow build; fall back
        # to the fixed bitmap font rather than failing the whole snapshot.
        try:
            font = ImageFont.load_default(size=18)
        except Exception:
            font = ImageFont.load_default()
        draw.text((14, out_height - bar_h + 8), address_en, fill=(255, 255, 255), font=font)

    buf = io.BytesIO()
    snapshot.save(buf, "JPEG", quality=90)
    return buf.getvalue()


app = FastAPI()

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    try:
        response = await call_next(request)
        # Admin lists must never be served from a browser/proxy cache — a stale
        # copy is what made newly added promoters "not appear" until a few refreshes.
        if request.method == "GET" and request.url.path.startswith("/admin"):
            response.headers["Cache-Control"] = "no-store"
        process_time = time.time() - start_time
        logger.info(f"{request.method} {request.url.path} - Status: {response.status_code} - Time: {process_time:.3f}s")
        return response
    except Exception as e:
        process_time = time.time() - start_time
        logger.error(f"{request.method} {request.url.path} - 500 ERROR - Time: {process_time:.3f}s", exc_info=e)
        origin = request.headers.get("origin") or "*"
        return JSONResponse(
            status_code=500,
            content={"detail": "خطای داخلی سرور رخ داد. به لاگ‌ها مراجعه کنید.", "error": str(e)},
            headers={
                "Access-Control-Allow-Origin": origin,
                "Access-Control-Allow-Credentials": "true",
                "Access-Control-Allow-Methods": "*",
                "Access-Control-Allow-Headers": "*",
            }
        )

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://api.promoter.thevuteam.com",
        "https://promoter.thevuteam.com",
        "https://admin.promoter.thevuteam.com",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_origin_regex=r"https://([a-zA-Z0-9-]+\.)*thevuteam\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled Error at {request.url.path}", exc_info=exc)
    origin = request.headers.get("origin") or "*"
    return JSONResponse(
        status_code=500,
        content={"detail": "خطای داخلی سرور رخ داد. به لاگ‌ها مراجعه کنید.", "error": str(exc)},
        headers={
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        }
    )

class CORSStaticFiles(StaticFiles):
    def is_not_modified(self, response_headers, req_headers):
        return False
        
    async def get_response(self, path: str, scope):
        response = await super().get_response(path, scope)
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "*"
        return response

app.mount("/uploads", CORSStaticFiles(directory=UPLOADS_DIR), name="uploads")


def extract_coordinates_from_location(location_str: str):
    """Try to extract latitude/longitude floats from a location string."""
    if not location_str:
        return None, None
    try:
        # Handle Google Maps style URLs with ?q=
        parsed = urlparse(location_str)
        if parsed.query:
            query = parse_qs(parsed.query)
            q_param = query.get('q')
            if q_param:
                coords = q_param[0].split(',')
                if len(coords) >= 2:
                    return float(coords[0]), float(coords[1])
        # Handle @lat,long inside URL path
        match = re.search(r'@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)', location_str)
        if match:
            return float(match.group(1)), float(match.group(2))
        # Handle plain "lat,long"
        parts = location_str.split(',')
        if len(parts) >= 2:
            return float(parts[0]), float(parts[1])
    except Exception:
        return None, None
    return None, None

_UPLOAD_ID_RE = re.compile(r'^[A-Za-z0-9_-]{8,64}$')


def _upload_id_path(upload_id: str, user_id: int) -> str:
    return os.path.join(UPLOADS_DIR, ".ids", f"{user_id}_{upload_id}")


@app.post("/upload/image")
async def upload_image(request: Request, file: UploadFile = File(...), user: Promoter = Depends(get_current_user)):
    """Optional `X-Upload-Id` makes the upload idempotent: on a flaky mobile link the photo can reach us
    while the response never reaches the phone — the client then asks /upload/status/{id} (a tiny request)
    instead of re-sending the whole photo, and a re-sent upload with the same id returns the stored file."""
    upload_id = request.headers.get("X-Upload-Id") or ""
    if upload_id and not _UPLOAD_ID_RE.match(upload_id):
        upload_id = ""
    try:
        if upload_id:
            marker = _upload_id_path(upload_id, user.id)
            if os.path.isfile(marker):
                with open(marker) as fh:
                    return {"url": f"{PUBLIC_BASE_URL}/uploads/{fh.read().strip()}"}
        file_name = await _save_upload(file, ALLOWED_IMAGE_EXTENSIONS)
        if upload_id:
            os.makedirs(os.path.dirname(_upload_id_path(upload_id, user.id)), exist_ok=True)
            with open(_upload_id_path(upload_id, user.id), "w") as fh:
                fh.write(file_name)
        return {"url": f"{PUBLIC_BASE_URL}/uploads/{file_name}"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading image: {e}")
        raise HTTPException(status_code=500, detail="Upload failed")


@app.get("/upload/status/{upload_id}")
def upload_status(upload_id: str, user: Promoter = Depends(get_current_user)):
    if not _UPLOAD_ID_RE.match(upload_id):
        raise HTTPException(status_code=400, detail="Invalid upload id")
    marker = _upload_id_path(upload_id, user.id)
    if not os.path.isfile(marker):
        raise HTTPException(status_code=404, detail="Not uploaded")
    with open(marker) as fh:
        return {"url": f"{PUBLIC_BASE_URL}/uploads/{fh.read().strip()}"}

@app.post("/upload/voice")
async def upload_voice(file: UploadFile = File(...), user: Promoter = Depends(get_current_user)):
    """Upload voice recording for AI processing"""
    try:
        file_name = await _save_upload(file, ALLOWED_VOICE_EXTENSIONS, prefix="voice_")
        return {
            "ok": True,
            "url": f"{PUBLIC_BASE_URL}/uploads/{file_name}",
            "filename": file_name
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading voice: {e}")
        raise HTTPException(status_code=500, detail="Upload failed")


class VoiceAnalysisResponse(BaseModel):
    store_name: str = ""
    seller_number: Optional[str] = None
    discount_amount: Optional[str] = None
    online_shop_experience: str = ""
    note: str = ""
    business_type: str = ""
    seller_role: str = ""
    selected_package: str = ""
    transaction_amount: Optional[str] = None
    address_floor: str = ""


@app.post("/ai/analyze-voice", response_model=VoiceAnalysisResponse)
async def analyze_voice_file(file: UploadFile = File(...), user: Promoter = Depends(get_current_user)):
    """
    Analyze voice recording from uploaded file.
    Test with curl:
    curl -X POST "https://api.promoter.thevuteam.com/ai/analyze-voice" -F "file=@voice.webm"
    """
    try:
        # Read file content and convert to base64
        file_content = await file.read()
        audio_base64 = base64.b64encode(file_content).decode('utf-8')
        
        # Determine mime type from filename
        mime_type = "audio/webm"
        if file.filename:
            if file.filename.endswith('.mp3'):
                mime_type = "audio/mp3"
            elif file.filename.endswith('.wav'):
                mime_type = "audio/wav"
            elif file.filename.endswith('.m4a'):
                mime_type = "audio/m4a"
            elif file.filename.endswith('.ogg'):
                mime_type = "audio/ogg"
        
        # ai_tools lives at the repo root (next to backend/), not inside app/ —
        # it was never imported, so this endpoint always died with a NameError.
        try:
            from ai_tools.voice_to_text import analyze_voice
        except ImportError:
            sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')))
            try:
                from ai_tools.voice_to_text import analyze_voice
            except ImportError as ie:
                logger.error(f"Voice analysis module unavailable: {ie}")
                raise HTTPException(status_code=503, detail="سرویس تحلیل صوت روی سرور نصب نیست")

        result = analyze_voice(
            audio_base64=audio_base64,
            mime_type=mime_type
        )
        
        return VoiceAnalysisResponse(**result)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error analyzing voice file: {e}")
        raise HTTPException(status_code=500, detail="Voice analysis failed")


@app.get("/")
def read_root():
    return {"status": "ok", "message": "Backend is running"}



# Load envs
SERVICE_ACCOUNT_JSON_PATH = os.getenv("SERVICE_ACCOUNT_JSON_PATH", "/secrets/sa.json")
SPREADSHEET_ID = os.getenv("SPREADSHEET_ID")
SHEET_NAME = os.getenv("SHEET_NAME", "Sheet1")

sheets_client = None
if SPREADSHEET_ID:
    try:
        sheets_client = SheetsClient(SERVICE_ACCOUNT_JSON_PATH, SPREADSHEET_ID, SHEET_NAME)
    except Exception as e:
        pass

class LoginIn(BaseModel):
    username: str
    password: str
    full_name: str | None = None
    phone_number: str | None = None
    team_name: str | None = None
    event_slug: str | None = None

class UserProfile(BaseModel):
    id: int
    username: str
    full_name: str | None = None
    role: str | None = None
    phone_number: str | None = None
    profile_picture: str | None = None
    team_name: str | None = None
    is_admin: bool = False
    can_manage_events: bool = False
    can_approve_reports: bool = False
    can_delete_reports: bool = False
    admin_client: str | None = None
    event_id: int | None = None
    event_slug: str | None = None
    last_latitude: float | None = None
    last_longitude: float | None = None
    last_location_time: str | None = None
    last_seen: str | None = None
    certificates: List[dict] = []
    gamification: dict | None = None
    assigned_dates: str | None = None
    daily_roles: str | None = None

class EventTemplateCreate(BaseModel):
    name: str
    description: str | None = None
    sections: list

class EventTemplateOut(BaseModel):
    id: int
    name: str
    description: str | None = None
    sections: list
    created_at: datetime

class UserUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = None
    phone_number: str | None = None
    profile_picture: str | None = None
    team_name: str | None = None

class FormIn(BaseModel):
    # Header fields
    date: str
    team_name: str
    promoter_name: str
    supervisor_name: str
    
    # Row fields
    online_shop_status: str | None = None
    row_number: str
    time: str
    location: str
    address_floor: str
    store_name: str
    business_type: str
    seller_number: str
    online_shop_experience: str
    seller_role: str
    discount_amount: str
    transaction_amount: str
    note: str | None = None
    images: List[str] | None = None  # لیست URL تصاویر

@app.post("/auth/register")
def register(data: LoginIn):
    # Registration disabled - admins must create promoters
    raise HTTPException(status_code=403, detail="Registration is disabled. Please contact admin.")

@app.post("/auth/login")
def login(data: LoginIn):
    db = SessionLocal()
    try:
        from auth import verify_password
        from sqlalchemy import func
        # Phones mangle what gets typed: the keyboard capitalizes the first
        # letter, autocomplete adds a trailing space, and a Persian keyboard
        # types ۰-۹ instead of 0-9. Normalize those instead of rejecting a
        # correct login; exact username match still wins when there is one.
        _fa_digits = str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789')
        username = (data.username or '').strip().translate(_fa_digits)
        password_candidates = list(dict.fromkeys([data.password, (data.password or '').translate(_fa_digits)]))
        users = db.query(Promoter).filter(Promoter.username == username).all()
        if not users and username:
            users = db.query(Promoter).filter(func.lower(Promoter.username) == username.lower()).all()
        valid_users = [u for u in users if any(verify_password(pw, u.hashed_password) for pw in password_candidates)]
        if not valid_users and username:
            # The exact-case rows (e.g. a promoter 'k-parisa') can shadow another row that differs only in
            # case (her admin login 'K-parisa'): none verified, so try every case variant before rejecting.
            users = db.query(Promoter).filter(func.lower(Promoter.username) == username.lower()).all()
            valid_users = [u for u in users if any(verify_password(pw, u.hashed_password) for pw in password_candidates)]

        if not valid_users:
            raise HTTPException(status_code=401, detail="نام کاربری یا رمز عبور اشتباه است.")

        user = None
        admin_users = [u for u in valid_users if getattr(u, 'is_admin', False)]
        
        if not data.event_slug and admin_users:
            user = admin_users[0]
        elif data.event_slug:
            # Find event without is_active filter — promoter may log in before event goes live
            event = db.query(Event).filter(Event.slug == data.event_slug).first()
            if not event:
                raise HTTPException(status_code=404, detail="رویداد یافت نشد")
            # Admin users can log into any event
            if admin_users:
                user = admin_users[0]
            else:
                # Find the promoter record that belongs to this specific event
                for u in valid_users:
                    if u.event_id == event.id:
                        user = u
                        break
                # If no event-specific record found, check if promoter has no event (global)
                if not user:
                    for u in valid_users:
                        if u.event_id is None:
                            user = u
                            break
        else:
            # No event slug — just pick first valid user (admin or otherwise)
            user = admin_users[0] if admin_users else valid_users[0]

        if not user:
            raise HTTPException(status_code=403, detail="شما به این رویداد دسترسی ندارید. با ادمین تماس بگیرید.")
        # A client-scoped panel account has no event of its own; it must not fall
        # through to the "global promoter" branch and log into an event form.
        if data.event_slug and client_scope(user):
            raise HTTPException(status_code=403, detail="شما به این رویداد دسترسی ندارید. با ادمین تماس بگیرید.")

        token = create_access_token({"sub": user.username, "user_id": user.id})
        return {"access_token": token, "token_type": "bearer"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during login: {e}")
        raise HTTPException(status_code=500, detail="Login failed")
    finally:
        db.close()

@app.get("/auth/me", response_model=UserProfile)
def get_me(user: Promoter = Depends(get_current_user)):
    certificates = []
    if user.roster_id:
        db = SessionLocal()
        try:
            roster = db.query(PromoterRoster).filter(PromoterRoster.id == user.roster_id).first()
            if roster:
                certificates = _normalize_certificates(roster.certificates)
        finally:
            db.close()
            
    # Calculate Gamification — aggregate across every Promoter login row tied
    # to the same roster_id (one gets created per event), not just this one,
    # so this matches the total shown in the admin roster/archive view.
    db = SessionLocal()
    try:
        if user.roster_id:
            promoter_ids = [p.id for p in db.query(Promoter).filter(Promoter.roster_id == user.roster_id).all()]
        else:
            promoter_ids = [user.id]
        override = None
        if user.roster_id:
            r = db.query(PromoterRoster).filter(PromoterRoster.id == user.roster_id).first()
            override = r.worked_days_override if r else None
        gamification = _compute_gamification(db, promoter_ids, override)
    finally:
        db.close()

    return UserProfile(
        id=user.id,
        username=user.username,
        full_name=user.full_name,
        role=user.role,
        phone_number=user.phone_number,
        profile_picture=user.profile_picture,
        team_name=user.team_name,
        is_admin=user.is_admin,
        can_manage_events=can_manage_events(user),
        can_approve_reports=can_approve_reports(user),
        can_delete_reports=can_delete_reports(user),
        admin_client=client_scope(user),
        event_id=user.event_id,
        event_slug=user.event.slug if getattr(user, 'event', None) else None,
        last_latitude=user.last_latitude,
        last_longitude=user.last_longitude,
        last_location_time=user.last_location_time.isoformat() + 'Z' if user.last_location_time else None,
        last_seen=user.last_seen.isoformat() + 'Z' if user.last_seen else None,
        certificates=certificates,
        gamification=gamification,
        assigned_dates=user.assigned_dates,
        daily_roles=user.daily_roles,
    )

@app.put("/auth/me", response_model=UserProfile)
def update_me(data: UserUpdate, user: Promoter = Depends(get_current_user)):
    db = SessionLocal()
    try:
        db_user = db.query(Promoter).filter(Promoter.id == user.id).first()
        if data.full_name is not None:
            db_user.full_name = data.full_name
        # Role decides what a crew member can see/do (captain, setup, …) — only
        # an admin may change it; a promoter can't promote themselves.
        if data.role is not None and db_user.is_admin:
            db_user.role = data.role
        if data.phone_number is not None:
            db_user.phone_number = data.phone_number
        if data.profile_picture is not None:
            db_user.profile_picture = data.profile_picture
        if data.team_name is not None:
            db_user.team_name = data.team_name
        db.commit()
        db.refresh(db_user)
        return UserProfile(
            id=db_user.id,
            username=db_user.username,
            full_name=db_user.full_name,
            role=db_user.role,
            phone_number=db_user.phone_number,
            profile_picture=db_user.profile_picture,
            team_name=db_user.team_name,
            is_admin=db_user.is_admin,
            event_id=db_user.event_id,
            last_latitude=db_user.last_latitude,
            last_longitude=db_user.last_longitude,
            last_location_time=db_user.last_location_time.isoformat() + 'Z' if db_user.last_location_time else None,
            last_seen=db_user.last_seen.isoformat() + 'Z' if db_user.last_seen else None
        )
    finally:
        db.close()

@app.post("/forms/submit")
def submit_form(form: FormIn, user: Promoter = Depends(get_current_user)):
    print("SUBMIT FORM CALLED")
    import sys
    sys.stdout.flush()
    try:
        print("IN TRY BLOCK")  # اضافه کن
        # if not sheets_client:
        #     print("Sheets client not initialized!")
        #     raise HTTPException(status_code=500, detail="Sheets client not initialized. Check server logs.")

        # مقدار team_name را از user بگیرید

        team_name = user.team_name
        seller_number = user.phone_number

        row = [
            form.date,
            team_name,  # مقدار خودکار از ثبت‌نام
            form.promoter_name,
            form.supervisor_name,
            form.row_number,
            form.time,
            form.location,
            form.address_floor,
            form.store_name,
            form.business_type,
            seller_number,  # مقدار خودکار از ثبت‌نام
            form.online_shop_experience,
            form.seller_role,
            form.discount_amount,
            form.transaction_amount,
            form.note,
            form.online_shop_status,
            user.username # Adding logged in username as extra info
        ]

        print("BEFORE SHEET APPEND")
        # sheets_client.append_row(row)
        print("AFTER SHEET APPEND")

        db = SessionLocal()
        db_report = Report(
            promoter_id=user.id,
            date=form.date,
            team_name=team_name,  # مقدار خودکار از ثبت‌نام
            promoter_name=form.promoter_name,
            supervisor_name=form.supervisor_name,
            row_number=form.row_number,
            time=form.time,
            location=form.location,
            address_floor=form.address_floor,
            store_name=form.store_name,
            business_type=form.business_type,
            seller_number=seller_number,  # مقدار خودکار از ثبت‌نام
            online_shop_experience=form.online_shop_experience,
            seller_role=form.seller_role,
            discount_amount=form.discount_amount,
            transaction_amount=form.transaction_amount,
            note=form.note,
            online_shop_status=form.online_shop_status,
            images=form.images
        )
        db.add(db_report)
        lat, lng = extract_coordinates_from_location(form.location)
        if lat is not None and lng is not None:
            promoter_record = db.query(Promoter).filter(Promoter.id == user.id).first()
            if promoter_record:
                promoter_record.last_latitude = lat
                promoter_record.last_longitude = lng
                promoter_record.last_location_time = datetime.utcnow()
                promoter_record.last_seen = datetime.utcnow()
        db.commit()
        db.close()

    except Exception as e:
        import traceback
        print("EXCEPTION OCCURRED:", e)
        print(traceback.format_exc())
        sys.stdout.flush()
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Failed to submit form")

    return {"ok": True, "written": row}

@app.get("/forms/history")
def get_history(user: Promoter = Depends(get_current_user)):
    db = SessionLocal()
    reports = db.query(Report).filter(Report.promoter_id == user.id).order_by(Report.id.desc()).all()
    db.close()
    return reports

@app.put("/forms/update/{form_id}")
def update_form(form_id: int, form: FormIn, user: Promoter = Depends(get_current_user)):
    db = SessionLocal()
    try:
        report = db.query(Report).filter(Report.id == form_id).first()
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        
        # Check permission (only owner or admin can update)
        if report.promoter_id != user.id and not user.is_admin:
             raise HTTPException(status_code=403, detail="Not authorized to update this report")

        # Update fields
        report.date = form.date
        report.team_name = form.team_name
        report.promoter_name = form.promoter_name
        report.supervisor_name = form.supervisor_name
        report.online_shop_status = form.online_shop_status
        report.row_number = form.row_number
        report.time = form.time
        report.location = form.location
        report.address_floor = form.address_floor
        report.store_name = form.store_name
        report.business_type = form.business_type
        report.seller_number = form.seller_number
        report.online_shop_experience = form.online_shop_experience
        report.seller_role = form.seller_role
        report.discount_amount = form.discount_amount
        report.transaction_amount = form.transaction_amount
        report.note = form.note
        if form.images is not None:
            report.images = form.images
            
        db.commit()
        db.refresh(report)
        return {"ok": True, "message": "Report updated successfully"}
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error updating report {form_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to update report")
    finally:
        db.close()

@app.delete("/forms/delete/{form_id}")
def delete_form(form_id: int, user: Promoter = Depends(get_current_user)):
    db = SessionLocal()
    try:
        report = db.query(Report).filter(Report.id == form_id).first()
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
            
        # Check permission (only owner or admin can delete)
        if report.promoter_id != user.id and not user.is_admin:
             raise HTTPException(status_code=403, detail="Not authorized to delete this report")
             
        db.delete(report)
        db.commit()
        return {"ok": True, "message": "Report deleted successfully"}
    except HTTPException as he:
        raise he
    except Exception as e:
        logger.error(f"Error deleting report {form_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete report")
    finally:
        db.close()

class LocationUpdate(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    event_id: Optional[int] = None

    @property
    def get_lat(self) -> float:
        if self.lat is not None:
            return self.lat
        if self.latitude is not None:
            return self.latitude
        return 0.0

    @property
    def get_lng(self) -> float:
        if self.lng is not None:
            return self.lng
        if self.longitude is not None:
            return self.longitude
        return 0.0

@app.post("/promoter/location")
def update_location(loc: LocationUpdate, user: Promoter = Depends(get_current_user)):
    """Update promoter's live location and save to history"""
    db = SessionLocal()
    try:
        user_db = db.query(Promoter).filter(Promoter.id == user.id).first()
        if user_db:
            user_db.last_latitude = loc.get_lat
            user_db.last_longitude = loc.get_lng
            user_db.last_location_time = datetime.utcnow()
            user_db.last_seen = datetime.utcnow()
            
            # Save to location history (every 5 minutes max)
            last_history = db.query(LocationHistory).filter(
                LocationHistory.promoter_id == user.id
            ).order_by(LocationHistory.timestamp.desc()).first()
            
            should_save = True
            if last_history:
                time_diff = (datetime.utcnow() - last_history.timestamp).total_seconds()
                if time_diff < 300:  # 5 minutes
                    should_save = False
            
            if should_save:
                history = LocationHistory(
                    promoter_id=user.id,
                    latitude=loc.get_lat,
                    longitude=loc.get_lng,
                    event_id=loc.event_id
                )
                db.add(history)
            
            db.commit()
        return {"ok": True}
    finally:
        db.close()


# ==================== HELPER FUNCTION FOR ADMIN CHECK ====================
def get_admin_user(user: Promoter = Depends(get_current_user)):
    """Check if current user is admin"""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def get_panel_user(user: Promoter = Depends(get_current_user)):
    """Full admins, or a client-scoped panel account (Promoter.admin_client).
    Only for endpoints that limit a scoped account to its client's events —
    via _ensure_event_scope / _scoped_event_ids — everything else stays get_admin_user."""
    if not user.is_admin and not client_scope(user):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def _event_in_scope(user, event) -> bool:
    if user.is_admin:
        return True
    scope = client_scope(user)
    # Archived events are hidden from scoped accounts (no «آرشیو ایونت‌ها» for them).
    return bool(event and scope and (event.client_name or '').strip().lower() == scope and not event.is_archived)


def _ensure_event_scope(db, user, event_id):
    if user.is_admin:
        return
    event = db.query(Event).filter(Event.id == event_id).first() if event_id is not None else None
    if not _event_in_scope(user, event):
        raise HTTPException(status_code=403, detail="شما به این ایونت دسترسی ندارید")


def _scoped_event_ids(db, user):
    """Event ids a scoped account may see (None = no limit, i.e. full admin)."""
    if user.is_admin:
        return None
    return {e.id for e in db.query(Event).all() if _event_in_scope(user, e)}


def _approval_clients(db):
    """Clients that have a scoped account — their events' reports need our approval."""
    return {(c or '').strip().lower() for (c,) in db.query(Promoter.admin_client).filter(Promoter.admin_client.isnot(None)).distinct()} - {''}


def _store_report_lists(d):
    """Mehram «<sectionId>_reports» lists (one entry per supermarket) found in a submission's data."""
    return {k: v for k, v in (d or {}).items()
            if k.endswith('_reports') and isinstance(v, list) and any(isinstance(r, dict) and r.get('storeId') for r in v)}


def _mehram_report_states(data, approved, reviews=None):
    """Per supermarket report: 'approved' (client sees this exact version), 'changed' (edited after
    approval), 'rejected' (an admin declined it, with a reason) or 'pending' (client doesn't see it).
    A rejected report the promoter edited afterwards is pending again. Empty for submissions without store reports."""
    out = {}
    reviews = reviews or {}
    ap = {k: {r.get('id'): r for r in v if isinstance(r, dict)} for k, v in _store_report_lists(approved).items()}
    for k, v in _store_report_lists(data).items():
        for r in v:
            if not isinstance(r, dict) or not r.get('id'):
                continue
            a = ap.get(k, {}).get(r['id'])
            if a is not None:
                out[str(r['id'])] = 'approved' if a == r else 'changed'
                continue
            rv = reviews.get(str(r['id']))
            edited_after = rv and rv.get('at_ms') and (r.get('submittedAt') or 0) > rv['at_ms']
            out[str(r['id'])] = 'rejected' if rv and not edited_after else 'pending'
    return out


def _load_reviews(db, submission_ids):
    """{submission_id: {report_id: {reason, by, at, at_ms}}}"""
    out = {}
    if not submission_ids:
        return out
    for rv in db.query(MehramReportReview).filter(MehramReportReview.submission_id.in_(list(submission_ids))).all():
        out.setdefault(rv.submission_id, {})[rv.report_id] = {
            "reason": rv.reason or '', "by": rv.reviewed_by,
            "at": rv.reviewed_at.isoformat() + 'Z' if rv.reviewed_at else None,
            "at_ms": int(rv.reviewed_at.replace(tzinfo=timezone.utc).timestamp() * 1000) if rv.reviewed_at else 0,
        }
    return out


def _load_approvals(db, submission_ids):
    """{submission_id: {report_id: {by, at}}} — who approved each supermarket report (admins only)."""
    out = {}
    if not submission_ids:
        return out
    for ap in db.query(MehramReportApprover).filter(MehramReportApprover.submission_id.in_(list(submission_ids))).all():
        out.setdefault(ap.submission_id, {})[ap.report_id] = {"by": ap.approved_by, "at": ap.approved_at.isoformat() + 'Z' if ap.approved_at else None}
    return out


def _pending_approval_counts(db, event_ids):
    """Per event: what the client can't see yet (never approved, or changed since). Mehram events
    count supermarket reports, everything else counts whole submissions."""
    out = {}
    if not event_ids:
        return out
    subs = db.query(EventSubmission).filter(EventSubmission.event_id.in_(event_ids)).all()
    reviews = _load_reviews(db, [s.id for s in subs])
    for s in subs:
        states = _mehram_report_states(s.data, s.approved_data, reviews.get(s.id))
        if states:
            n = sum(1 for v in states.values() if v in ('pending', 'changed'))
            if n:
                out[s.event_id] = out.get(s.event_id, 0) + n
        elif s.approved_data is None or _client_view_data(s.data) != _client_view_data(s.approved_data):
            out[s.event_id] = out.get(s.event_id, 0) + 1
    return out


def _client_view_data(data):
    """What a client may see of a submission: no internal review flags."""
    return {k: v for k, v in (data or {}).items() if k not in ('_flags', '_admin_edits')}


def get_event_manager_user(user: Promoter = Depends(get_admin_user)):
    """Client approval / archive / delete of events is limited to kave, S.Parmida and K-parisa."""
    if not can_manage_events(user):
        raise HTTPException(status_code=403, detail="شما اجازه تایید کلاینت، آرشیو یا حذف ایونت را ندارید")
    return user


def assert_promoter_can_access_event(promoter_user: Promoter | None, event: Event) -> None:
    """Default-deny gate for every /events/{slug}/... endpoint a promoter's own
    device calls. A promoter row is minted per event edition (see Promoter.event_id)
    and is meant to write to exactly that one event — but because tokens live 90
    days and the same username/device gets reused across recurring editions
    (e.g. a "Tehroon-XXX-##" series), a stale session can still resolve to a
    valid-but-wrong-event Promoter row while sitting on a different event's URL.
    Every prior version of this check only rejected when `event_id` was set AND
    mismatched, silently *allowing* a null `event_id` through — the exact gap
    that let a report meant for one event get written into another. A non-admin
    promoter must always have an explicit, matching event_id; anything else (no
    row, no event_id, or a different event_id) is denied, never allowed by
    default.
    """
    if promoter_user is None:
        raise HTTPException(status_code=401, detail="برای این عملیات باید وارد شوید")
    if getattr(promoter_user, 'is_admin', False):
        return
    if promoter_user.event_id != event.id:
        raise HTTPException(status_code=403, detail="شما به این رویداد دسترسی ندارید")

# ==================== LOCATION & HEARTBEAT ENDPOINTS ====================

from datetime import datetime, timedelta

class LocationUpdate(BaseModel):
    latitude: float
    longitude: float
    event_id: Optional[int] = None

@app.post("/location/update")
def update_location(data: LocationUpdate, user: Promoter = Depends(get_current_user)):
    """Update promoter's location and last_seen timestamp"""
    db = SessionLocal()
    try:
        db_user = db.query(Promoter).filter(Promoter.id == user.id).first()
        db_user.last_latitude = data.latitude
        db_user.last_longitude = data.longitude
        db_user.last_location_time = datetime.utcnow()
        db_user.last_seen = datetime.utcnow()
        db.commit()
        return {"ok": True}
    finally:
        db.close()

@app.post("/heartbeat")
def heartbeat(user: Promoter = Depends(get_current_user)):
    """Update last_seen timestamp (called periodically to show online status)"""
    db = SessionLocal()
    try:
        db_user = db.query(Promoter).filter(Promoter.id == user.id).first()
        db_user.last_seen = datetime.utcnow()
        db.commit()
        return {"ok": True, "timestamp": datetime.utcnow().isoformat() + 'Z'}
    finally:
        db.close()


class PromoterLocationOut(BaseModel):
    id: int
    username: str
    full_name: str | None = None
    team_name: str | None = None
    phone_number: str | None = None
    last_latitude: float | None = None
    last_longitude: float | None = None
    last_location_time: str | None = None
    last_seen: str | None = None
    is_online: bool = False
    history: list[list[float]] = []

    class Config:
        from_attributes = True

@app.get("/admin/promoters/locations", response_model=list[PromoterLocationOut])
def admin_get_promoters_locations(admin: Promoter = Depends(get_admin_user)):
    """Get all promoters with their locations, online status, and today's path (admin only)"""
    db = SessionLocal()
    try:
        promoters = db.query(Promoter).filter(Promoter.is_admin == False).all()
        
        now = datetime.utcnow()
        today_start = datetime(now.year, now.month, now.day)
        
        # Query location history for today to avoid N+1
        history_records = db.query(LocationHistory).filter(LocationHistory.timestamp >= today_start).order_by(LocationHistory.timestamp).all()
        history_map = {}
        for r in history_records:
            if r.promoter_id not in history_map:
                history_map[r.promoter_id] = []
            history_map[r.promoter_id].append([r.latitude, r.longitude])
            
        result = []
        for p in promoters:
            # Consider online if last_seen within 5 minutes
            is_online = False
            if p.last_seen:
                time_diff = (now - p.last_seen).total_seconds()
                is_online = time_diff < 300  # 5 minutes
            
            p_history = history_map.get(p.id, [])
            if p.last_latitude and p.last_longitude:
                # Always ensure the last known location is at the end of the history
                p_history.append([p.last_latitude, p.last_longitude])
                
            result.append({
                "id": p.id,
                "username": p.username,
                "full_name": p.full_name,
                "team_name": p.team_name,
                "phone_number": p.phone_number,
                "last_latitude": p.last_latitude,
                "last_longitude": p.last_longitude,
                "last_location_time": p.last_location_time.isoformat() + 'Z' if p.last_location_time else None,
                "last_seen": p.last_seen.isoformat() + 'Z' if p.last_seen else None,
                "is_online": is_online,
                "history": p_history
            })
        
        return result
    finally:
        db.close()

class AdminUserUpdate(BaseModel):
    full_name: str | None = None
    role: str | None = None
    phone_number: str | None = None
    team_name: str | None = None
    assigned_dates: str | None = None
    daily_roles: str | None = None
    is_admin: bool | None = None
    password: str | None = None
    profile_picture: str | None = None

class PromoterOut(BaseModel):
    id: int
    username: str
    full_name: str | None = None
    role: str | None = None
    phone_number: str | None = None
    team_name: str | None = None
    profile_picture: str | None = None
    is_admin: bool = False
    event_id: int | None = None
    last_latitude: float | None = None
    last_longitude: float | None = None
    last_location_time: str | None = None
    last_seen: str | None = None
    plain_password: str | None = None
    roster_id: int | None = None
    assigned_dates: str | None = None
    daily_roles: str | None = None

    class Config:
        from_attributes = True

class PromoterCreate(BaseModel):
    username: str
    password: str
    full_name: str | None = None
    role: str | None = None
    phone_number: str | None = None
    team_name: str | None = None
    event_id: int | None = None
    roster_id: int | None = None
    assigned_dates: str | None = None
    daily_roles: str | None = None

@app.post("/admin/promoters", response_model=PromoterOut)
def admin_create_promoter(data: PromoterCreate, admin: Promoter = Depends(get_panel_user)):
    """Create a new promoter (admin only)"""
    db = SessionLocal()
    try:
        _ensure_event_scope(db, admin, data.event_id)
        if data.event_id is not None and db.query(Promoter).filter(Promoter.username == data.username, Promoter.event_id == data.event_id).first():
            raise HTTPException(status_code=400, detail="username exists in this event")
        # Inherit the archive photo for this person, if one exists, so a brand
        # new event assignment shows up with a picture everywhere immediately.
        inherited_picture = None
        final_password = data.password
        roster_entry = None
        if data.roster_id is not None:
            roster_entry = db.query(PromoterRoster).filter(PromoterRoster.id == data.roster_id).first()
            if roster_entry:
                inherited_picture = roster_entry.profile_picture
                # This person's password is the roster's — one standing password
                # reused across every event they're added to, not a fresh random
                # one forked per event. Without this, a repeat promoter ends up
                # with a different password on each event's Promoter row (none of
                # which ever synced back to the roster), so they keep typing
                # whichever one they last remembered — which authenticates fine,
                # just for the WRONG event's row — and gets a correct "you don't
                # have access to this event" from /auth/login for the new one,
                # even though the admin genuinely did grant them access.
                if roster_entry.plain_password:
                    final_password = decrypt_value(roster_entry.plain_password)
                else:
                    roster_entry.plain_password = encrypt_value(data.password)
        hashed = get_password_hash(final_password)
        new_promoter = Promoter(
            username=data.username,
            hashed_password=hashed,
            full_name=data.full_name,
            role=data.role,
            phone_number=data.phone_number,
            team_name=data.team_name,
            event_id=data.event_id,
            roster_id=data.roster_id,
            assigned_dates=data.assigned_dates,
            daily_roles=data.daily_roles,
            plain_password=encrypt_value(final_password),
            profile_picture=inherited_picture,
            is_admin=False
        )
        db.add(new_promoter)
        db.commit()
        db.refresh(new_promoter)
        return PromoterOut(
            id=new_promoter.id,
            username=new_promoter.username,
            full_name=new_promoter.full_name,
            role=new_promoter.role,
            phone_number=new_promoter.phone_number,
            team_name=new_promoter.team_name,
            profile_picture=new_promoter.profile_picture,
            is_admin=new_promoter.is_admin,
            event_id=new_promoter.event_id,
            last_latitude=new_promoter.last_latitude,
            last_longitude=new_promoter.last_longitude,
            last_location_time=new_promoter.last_location_time.isoformat() + 'Z' if new_promoter.last_location_time else None,
            last_seen=new_promoter.last_seen.isoformat() + 'Z' if new_promoter.last_seen else None,
            plain_password=new_promoter.plain_password if admin.is_admin else None,
            roster_id=new_promoter.roster_id,
            assigned_dates=new_promoter.assigned_dates,
            daily_roles=new_promoter.daily_roles
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating promoter: {e}")
        raise HTTPException(status_code=500, detail="Failed to create promoter")
    finally:
        db.close()

# ==================== CHECKLIST PRESETS ====================

class ChecklistPresetCreate(BaseModel):
    title: str
    items: list

class ChecklistPresetOut(BaseModel):
    id: int
    title: str
    items: list
    created_at: datetime

@app.get("/admin/checklist-presets", response_model=List[ChecklistPresetOut])
def get_checklist_presets(user: Promoter = Depends(get_current_user)):
    """Get all checklist presets (any logged in user can read them, admin can modify)"""
    db = SessionLocal()
    try:
        presets = db.query(ChecklistPreset).order_by(ChecklistPreset.created_at.desc()).all()
        return presets
    finally:
        db.close()

@app.post("/admin/checklist-presets", response_model=ChecklistPresetOut)
def create_checklist_preset(data: ChecklistPresetCreate, admin: Promoter = Depends(get_admin_user)):
    db = SessionLocal()
    try:
        if db.query(ChecklistPreset).filter(ChecklistPreset.title == data.title).first():
            raise HTTPException(status_code=400, detail="قالبی با این نام از قبل وجود دارد")
            
        new_preset = ChecklistPreset(
            title=data.title,
            items=data.items
        )
        db.add(new_preset)
        db.commit()
        db.refresh(new_preset)
        return new_preset
    finally:
        db.close()

@app.put("/admin/checklist-presets/{preset_id}", response_model=ChecklistPresetOut)
def update_checklist_preset(preset_id: int, data: ChecklistPresetCreate, admin: Promoter = Depends(get_admin_user)):
    db = SessionLocal()
    try:
        preset = db.query(ChecklistPreset).filter(ChecklistPreset.id == preset_id).first()
        if not preset:
            raise HTTPException(status_code=404, detail="قالب پیدا نشد")
            
        # Check title uniqueness if title changed
        if data.title != preset.title:
            if db.query(ChecklistPreset).filter(ChecklistPreset.title == data.title).first():
                raise HTTPException(status_code=400, detail="قالبی با این نام از قبل وجود دارد")
                
        preset.title = data.title
        preset.items = data.items
        db.commit()
        db.refresh(preset)
        return preset
    finally:
        db.close()

@app.delete("/admin/checklist-presets/{preset_id}")
def delete_checklist_preset(preset_id: int, admin: Promoter = Depends(get_admin_user)):
    db = SessionLocal()
    try:
        preset = db.query(ChecklistPreset).filter(ChecklistPreset.id == preset_id).first()
        if not preset:
            raise HTTPException(status_code=404, detail="قالب پیدا نشد")
            
        db.delete(preset)
        db.commit()
        return {"ok": True, "message": "قالب با موفقیت حذف شد"}
    finally:
        db.close()

# ==================== BRIEF PRESETS ====================

class BriefPresetCreate(BaseModel):
    title: str
    text: str

class BriefPresetOut(BaseModel):
    id: int
    title: str
    text: str
    created_at: datetime

@app.get("/admin/brief-presets", response_model=List[BriefPresetOut])
def get_brief_presets(user: Promoter = Depends(get_current_user)):
    """Get all brief presets"""
    db = SessionLocal()
    try:
        presets = db.query(BriefPreset).order_by(BriefPreset.created_at.desc()).all()
        return presets
    finally:
        db.close()

@app.post("/admin/brief-presets", response_model=BriefPresetOut)
def create_brief_preset(data: BriefPresetCreate, admin: Promoter = Depends(get_admin_user)):
    db = SessionLocal()
    try:
        if db.query(BriefPreset).filter(BriefPreset.title == data.title).first():
            raise HTTPException(status_code=400, detail="قالبی با این نام از قبل وجود دارد")
            
        new_preset = BriefPreset(
            title=data.title,
            text=data.text
        )
        db.add(new_preset)
        db.commit()
        db.refresh(new_preset)
        return new_preset
    finally:
        db.close()

@app.put("/admin/brief-presets/{preset_id}", response_model=BriefPresetOut)
def update_brief_preset(preset_id: int, data: BriefPresetCreate, admin: Promoter = Depends(get_admin_user)):
    db = SessionLocal()
    try:
        preset = db.query(BriefPreset).filter(BriefPreset.id == preset_id).first()
        if not preset:
            raise HTTPException(status_code=404, detail="قالب پیدا نشد")
            
        if data.title != preset.title:
            if db.query(BriefPreset).filter(BriefPreset.title == data.title).first():
                raise HTTPException(status_code=400, detail="قالبی با این نام از قبل وجود دارد")
                
        preset.title = data.title
        preset.text = data.text
        db.commit()
        db.refresh(preset)
        return preset
    finally:
        db.close()

@app.delete("/admin/brief-presets/{preset_id}")
def delete_brief_preset(preset_id: int, admin: Promoter = Depends(get_admin_user)):
    db = SessionLocal()
    try:
        preset = db.query(BriefPreset).filter(BriefPreset.id == preset_id).first()
        if not preset:
            raise HTTPException(status_code=404, detail="قالب پیدا نشد")
            
        db.delete(preset)
        db.commit()
        return {"ok": True, "message": "قالب با موفقیت حذف شد"}
    finally:
        db.close()

@app.get("/admin/promoters", response_model=list[PromoterOut])
def admin_get_all_promoters(event_id: Optional[int] = None, admin: Promoter = Depends(get_panel_user)):
    """Get all promoters (admin only; a scoped account only per event of its client)"""
    db = SessionLocal()
    try:
        if not admin.is_admin:
            _ensure_event_scope(db, admin, event_id)
        query = db.query(Promoter)
        if event_id is not None:
            query = query.filter(Promoter.event_id == event_id)
        promoters = query.all()
        result = []
        for p in promoters:
            result.append(PromoterOut(
                id=p.id,
                username=p.username,
                full_name=p.full_name,
                role=p.role,
                phone_number=p.phone_number,
                team_name=p.team_name,
                profile_picture=p.profile_picture,
                is_admin=p.is_admin,
                event_id=p.event_id,
                roster_id=p.roster_id,
                last_latitude=p.last_latitude,
                last_longitude=p.last_longitude,
                last_location_time=p.last_location_time.isoformat() + 'Z' if p.last_location_time else None,
                last_seen=p.last_seen.isoformat() + 'Z' if p.last_seen else None,
                # A client account never gets promoter passwords — it could log in
                # as the promoter and submit reports around our approval step.
                plain_password=decrypt_value(p.plain_password) if admin.is_admin else None,
                assigned_dates=p.assigned_dates,
                daily_roles=p.daily_roles
            ))
        return result
    finally:
        db.close()

@app.get("/admin/promoters/{promoter_id}", response_model=PromoterOut)
def admin_get_promoter(promoter_id: int, admin: Promoter = Depends(get_admin_user)):
    """Get single promoter by ID (admin only)"""
    db = SessionLocal()
    try:
        p = db.query(Promoter).filter(Promoter.id == promoter_id).first()
        if not p:
            raise HTTPException(status_code=404, detail="Promoter not found")
        return PromoterOut(
            id=p.id,
            username=p.username,
            full_name=p.full_name,
            role=p.role,
            phone_number=p.phone_number,
            team_name=p.team_name,
            profile_picture=p.profile_picture,
            is_admin=p.is_admin,
            event_id=p.event_id,
            roster_id=p.roster_id,
            assigned_dates=p.assigned_dates,
            daily_roles=p.daily_roles,
            last_latitude=p.last_latitude,
            last_longitude=p.last_longitude,
            last_location_time=p.last_location_time.isoformat() + 'Z' if p.last_location_time else None,
            last_seen=p.last_seen.isoformat() + 'Z' if p.last_seen else None
        )
    finally:
        db.close()

@app.put("/admin/promoters/{promoter_id}", response_model=PromoterOut)
def admin_update_promoter(promoter_id: int, data: AdminUserUpdate, admin: Promoter = Depends(get_panel_user)):
    """Update promoter (admin only)"""
    db = SessionLocal()
    try:
        p = db.query(Promoter).filter(Promoter.id == promoter_id).first()
        if not p:
            raise HTTPException(status_code=404, detail="Promoter not found")
        _ensure_event_scope(db, admin, p.event_id)
        # A client account can't make admins, nor set a promoter's password (it could then log in as them).
        if not admin.is_admin and (data.is_admin is not None or (data.password or '').strip()):
            raise HTTPException(status_code=403, detail="Admin access required")
        
        if data.full_name is not None:
            p.full_name = data.full_name
        if data.role is not None:
            p.role = data.role
        if data.phone_number is not None:
            p.phone_number = data.phone_number
        if data.team_name is not None:
            p.team_name = data.team_name
        if data.assigned_dates is not None:
            p.assigned_dates = data.assigned_dates
        if data.daily_roles is not None:
            p.daily_roles = data.daily_roles
        if data.is_admin is not None:
            p.is_admin = data.is_admin
        if data.profile_picture is not None:
            p.profile_picture = data.profile_picture
            # The archive is the source of truth for identity: keep the roster
            # entry and every sibling event row of this person on the same photo.
            if p.roster_id:
                roster = db.query(PromoterRoster).filter(PromoterRoster.id == p.roster_id).first()
                if roster:
                    roster.profile_picture = data.profile_picture
                db.query(Promoter).filter(Promoter.roster_id == p.roster_id).update({"profile_picture": data.profile_picture})
        if data.password is not None and data.password.strip() != '':
            p.hashed_password = get_password_hash(data.password)
            p.plain_password = encrypt_value(data.password)
            
        db.commit()
        db.refresh(p)
        return PromoterOut(
            id=p.id,
            username=p.username,
            full_name=p.full_name,
            profile_picture=p.profile_picture,
            role=p.role,
            phone_number=p.phone_number,
            team_name=p.team_name,
            is_admin=p.is_admin,
            event_id=p.event_id,
            roster_id=p.roster_id,
            assigned_dates=p.assigned_dates,
            daily_roles=p.daily_roles,
            last_latitude=p.last_latitude,
            last_longitude=p.last_longitude,
            last_location_time=p.last_location_time.isoformat() + 'Z' if p.last_location_time else None,
            last_seen=p.last_seen.isoformat() + 'Z' if p.last_seen else None
        )
    finally:
        db.close()

@app.delete("/admin/promoters/{promoter_id}")
def admin_delete_promoter(promoter_id: int, admin: Promoter = Depends(get_panel_user)):
    """Delete promoter (admin only)"""
    db = SessionLocal()
    try:
        promoter = db.query(Promoter).filter(Promoter.id == promoter_id).first()
        if not promoter:
            raise HTTPException(status_code=404, detail="Promoter not found")
        _ensure_event_scope(db, admin, promoter.event_id)
        if promoter.id == admin.id:
            raise HTTPException(status_code=400, detail="Cannot delete yourself")
        
        # Delete related reports first
        db.query(Report).filter(Report.promoter_id == promoter_id).delete()
        db.delete(promoter)
        db.commit()
        return {"ok": True, "message": "Promoter deleted"}
    finally:
        db.close()


# ── Promoter Roster (آرشیو پروموترها، مستقل از ایونت) ──

_FA_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹", "0123456789")

def _parse_date_tokens(raw):
    """Normalizes a comma-joined date string (possibly Farsi digits / mixed separators) into a set of comparable tokens."""
    if not raw:
        return set()
    out = set()
    for part in raw.split(','):
        p = part.strip().translate(_FA_DIGITS).replace('-', '/').replace('.', '/')
        p = re.sub(r'/+', '/', p).strip('/')
        if p:
            out.add(p)
    return out

def _parse_hm_range(start, end):
    def to_min(s):
        try:
            h, m = s.split(':')
            return int(h) * 60 + int(m)
        except Exception:
            return None
    s, e = to_min(start), to_min(end)
    # Missing time info: assume the whole day is occupied (conservative — a missed
    # conflict is worse than an unnecessary warning).
    return (0, 1440) if s is None or e is None else (s, e)

def _ranges_overlap(a_start, a_end, b_start, b_end):
    return a_start < b_end and b_start < a_end


class CertificateItem(BaseModel):
    type: str  # 'text' | 'image'
    value: str  # text label, or image URL
    label: Optional[str] = None  # optional caption for image-type items

class PromoterRosterCreate(BaseModel):
    full_name: str
    phone_number: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    certificates: List[CertificateItem] = []
    notes: Optional[str] = None
    profile_picture: Optional[str] = None
    gender: Optional[str] = None
    badge_ids: Optional[List[int]] = None
    city: Optional[str] = None

class PromoterRosterUpdate(BaseModel):
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    certificates: Optional[List[CertificateItem]] = None
    notes: Optional[str] = None
    profile_picture: Optional[str] = None
    gender: Optional[str] = None
    badge_ids: Optional[List[int]] = None
    city: Optional[str] = None

class RosterAssignmentOut(BaseModel):
    event_id: int
    event_name: str
    event_slug: str
    is_active: bool
    promoter_id: int

class PromoterRosterOut(BaseModel):
    id: int
    full_name: str
    phone_number: Optional[str] = None
    username: Optional[str] = None
    plain_password: Optional[str] = None
    certificates: List[CertificateItem] = []
    notes: Optional[str] = None
    profile_picture: Optional[str] = None
    created_at: Optional[str] = None
    assignments: List[RosterAssignmentOut] = []
    gamification: Optional[dict] = None
    gender: Optional[str] = None
    badge_ids: List[int] = []
    badges: List[dict] = []
    city: Optional[str] = None


class BadgeIn(BaseModel):
    name: str
    image_url: Optional[str] = None
    color: Optional[str] = None


def _clean_city(c):
    c = ' '.join((c or '').split())
    if len(c) > 60:
        raise HTTPException(status_code=400, detail="نام شهر بیش از حد طولانی است")
    return c or None


def _clean_gender(g):
    g = (g or '').strip().lower()
    if g not in ('male', 'female', ''):
        raise HTTPException(status_code=400, detail="gender must be 'male' or 'female'")
    return g or None


def _badge_out(b: Badge) -> dict:
    return {"id": b.id, "name": b.name, "image_url": b.image_url, "color": b.color}

class ConflictOut(BaseModel):
    event_id: int
    event_name: str
    event_slug: str
    overlapping_dates: List[str]


def _normalize_certificates(raw):
    """Older roster rows stored certificates as plain strings; normalize to {type,value} objects."""
    out = []
    for c in (raw or []):
        if isinstance(c, str):
            out.append({"type": "text", "value": c})
        elif isinstance(c, dict):
            out.append({"type": c.get("type", "text"), "value": c.get("value", ""), "label": c.get("label")})
    return out


def _roster_to_out(db, r: PromoterRoster, badges_by_id=None) -> PromoterRosterOut:
    rows = (db.query(Promoter, Event)
              .join(Event, Promoter.event_id == Event.id)
              .filter(Promoter.roster_id == r.id)
              .all())
    assignments = [
        # An assignment only counts as "active" while its event is both marked
        # active AND not archived — ev.is_active alone never flips off when an
        # event ends and gets archived, which used to leave promoters stuck
        # showing as active on events that had long since finished.
        RosterAssignmentOut(event_id=ev.id, event_name=ev.name, event_slug=ev.slug,
                             is_active=bool(ev.is_active) and not bool(ev.is_archived), promoter_id=p.id)
        for p, ev in rows
    ]
    
    # Calculate gamification
    all_promoter_ids = [p.id for p in db.query(Promoter).filter(Promoter.roster_id == r.id).all()]
    gamification = _compute_gamification(db, all_promoter_ids, r.worked_days_override)

    if badges_by_id is None:
        badges_by_id = {b.id: b for b in db.query(Badge).all()}
    badge_ids = [i for i in (r.badge_ids or []) if i in badges_by_id]

    return PromoterRosterOut(
        gender=r.gender, city=r.city, badge_ids=badge_ids, badges=[_badge_out(badges_by_id[i]) for i in badge_ids],
        id=r.id, full_name=r.full_name, phone_number=r.phone_number, username=r.username,
        plain_password=decrypt_value(r.plain_password), certificates=_normalize_certificates(r.certificates),
        notes=r.notes, profile_picture=r.profile_picture,
        created_at=r.created_at.isoformat() + 'Z' if r.created_at else None,
        assignments=assignments,
        gamification=gamification
    )


@app.post("/admin/promoter-roster", response_model=PromoterRosterOut)
def create_roster_entry(data: PromoterRosterCreate, admin: Promoter = Depends(get_panel_user)):
    db = SessionLocal()
    try:
        entry = PromoterRoster(
            full_name=data.full_name,
            phone_number=data.phone_number,
            username=data.username,
            plain_password=encrypt_value(data.password) if data.password else None,
            certificates=[c.model_dump() for c in data.certificates],
            notes=data.notes,
            profile_picture=data.profile_picture,
            gender=_clean_gender(data.gender),
            city=_clean_city(data.city),
            badge_ids=data.badge_ids or []
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)
        return _roster_to_out(db, entry)
    finally:
        db.close()


@app.get("/admin/promoter-roster", response_model=list[PromoterRosterOut])
def list_roster(admin: Promoter = Depends(get_panel_user)):
    db = SessionLocal()
    try:
        entries = db.query(PromoterRoster).order_by(PromoterRoster.full_name).all()
        badges_by_id = {b.id: b for b in db.query(Badge).all()}
        out = [_roster_to_out(db, r, badges_by_id) for r in entries]
        allowed = _scoped_event_ids(db, admin)
        if allowed is not None:
            # Scoped account only picks people for its own events: no passwords,
            # no other clients' events.
            for o in out:
                o.plain_password = None
                o.assignments = [a for a in o.assignments if a.event_id in allowed]
        # Most worked days first; the name order above breaks ties (sort is stable).
        out.sort(key=lambda o: (o.gamification or {}).get("total_days", 0), reverse=True)
        return out
    finally:
        db.close()


@app.put("/admin/promoter-roster/{roster_id}", response_model=PromoterRosterOut)
def update_roster_entry(roster_id: int, data: PromoterRosterUpdate, admin: Promoter = Depends(get_admin_user)):
    db = SessionLocal()
    try:
        entry = db.query(PromoterRoster).filter(PromoterRoster.id == roster_id).first()
        if not entry:
            raise HTTPException(status_code=404, detail="Roster entry not found")
        if data.full_name is not None:
            entry.full_name = data.full_name
        if data.phone_number is not None:
            entry.phone_number = data.phone_number
        if data.username is not None:
            entry.username = data.username
        if data.password is not None and data.password.strip() != '':
            entry.plain_password = encrypt_value(data.password)
        if data.certificates is not None:
            entry.certificates = [c.model_dump() for c in data.certificates]
        if data.notes is not None:
            entry.notes = data.notes
        if data.gender is not None:
            entry.gender = _clean_gender(data.gender)
        if data.city is not None:
            entry.city = _clean_city(data.city)  # '' clears it
        if data.badge_ids is not None:
            known = {b.id for b in db.query(Badge.id).all()}
            entry.badge_ids = [i for i in dict.fromkeys(data.badge_ids) if i in known]
        if data.profile_picture is not None:
            entry.profile_picture = data.profile_picture
            # Archive is the source of truth for identity — push the new photo onto
            # every event-specific Promoter row for this person so it shows up
            # immediately everywhere (own profile, reports, dashboard, map) without
            # each of them needing to re-upload it themselves.
            db.query(Promoter).filter(Promoter.roster_id == roster_id).update({"profile_picture": data.profile_picture})
        db.commit()
        db.refresh(entry)
        return _roster_to_out(db, entry)
    finally:
        db.close()


@app.get("/admin/badges")
def list_badges(admin: Promoter = Depends(get_panel_user)):
    db = SessionLocal()
    try:
        return [_badge_out(b) for b in db.query(Badge).order_by(Badge.name).all()]
    finally:
        db.close()


@app.post("/admin/badges")
def create_badge(data: BadgeIn, admin: Promoter = Depends(get_admin_user)):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Badge name is required")
    db = SessionLocal()
    try:
        b = Badge(name=name, image_url=data.image_url or None, color=data.color or None)
        db.add(b)
        db.commit()
        db.refresh(b)
        return _badge_out(b)
    finally:
        db.close()


@app.put("/admin/badges/{badge_id}")
def update_badge(badge_id: int, data: BadgeIn, admin: Promoter = Depends(get_admin_user)):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Badge name is required")
    db = SessionLocal()
    try:
        b = db.query(Badge).filter(Badge.id == badge_id).first()
        if not b:
            raise HTTPException(status_code=404, detail="Badge not found")
        b.name = name
        b.image_url = data.image_url or None
        b.color = data.color or None
        db.commit()
        return _badge_out(b)
    finally:
        db.close()


@app.delete("/admin/badges/{badge_id}")
def delete_badge(badge_id: int, admin: Promoter = Depends(get_admin_user)):
    db = SessionLocal()
    try:
        b = db.query(Badge).filter(Badge.id == badge_id).first()
        if not b:
            raise HTTPException(status_code=404, detail="Badge not found")
        for r in db.query(PromoterRoster).filter(PromoterRoster.badge_ids.isnot(None)).all():
            if badge_id in (r.badge_ids or []):
                r.badge_ids = [i for i in r.badge_ids if i != badge_id]
        db.delete(b)
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.delete("/admin/promoter-roster/{roster_id}")
def delete_roster_entry(roster_id: int, admin: Promoter = Depends(get_admin_user)):
    db = SessionLocal()
    try:
        entry = db.query(PromoterRoster).filter(PromoterRoster.id == roster_id).first()
        if not entry:
            raise HTTPException(status_code=404, detail="Roster entry not found")
        unlinked = db.query(Promoter).filter(Promoter.roster_id == roster_id).update({"roster_id": None})
        db.delete(entry)
        db.commit()
        return {"ok": True, "unlinked_count": unlinked}
    finally:
        db.close()


@app.get("/admin/promoter-roster/{roster_id}/conflicts", response_model=list[ConflictOut])
def check_roster_conflicts(roster_id: int, event_id: int, admin: Promoter = Depends(get_panel_user)):
    db = SessionLocal()
    try:
        _ensure_event_scope(db, admin, event_id)
        target = db.query(Event).filter(Event.id == event_id).first()
        if not target:
            raise HTTPException(status_code=404, detail="Event not found")
        target_dates = _parse_date_tokens(target.start_date)
        t_start, t_end = _parse_hm_range(target.start_time, target.end_time)

        rows = (db.query(Promoter, Event)
                  .join(Event, Promoter.event_id == Event.id)
                  .filter(Promoter.roster_id == roster_id, Promoter.event_id != event_id)
                  .all())
        conflicts = []
        for promoter, ev in rows:
            other_dates = _parse_date_tokens(ev.start_date)
            shared = target_dates & other_dates
            if not shared:
                continue
            o_start, o_end = _parse_hm_range(ev.start_time, ev.end_time)
            if _ranges_overlap(t_start, t_end, o_start, o_end):
                visible = _event_in_scope(admin, ev)
                conflicts.append(ConflictOut(event_id=ev.id if visible else 0, event_name=ev.name if visible else 'یک ایونت دیگر',
                                              event_slug=ev.slug if visible else '', overlapping_dates=sorted(shared)))
        return conflicts
    finally:
        db.close()


@app.get("/admin/reports")
def admin_get_all_reports(admin: Promoter = Depends(get_admin_user)):
    """Get all reports from all promoters (admin only)"""
    db = SessionLocal()
    try:
        reports = db.query(Report).options(joinedload(Report.owner)).order_by(Report.id.desc()).all()
        # Add promoter info to each report
        result = []
        for report in reports:
            report_dict = {
                "id": report.id,
                "promoter_id": report.promoter_id,
                "date": report.date,
                "team_name": report.team_name,
                "promoter_name": report.promoter_name,
                "supervisor_name": report.supervisor_name,
                "store_name": report.store_name,
                "location": report.location,
                "transaction_amount": report.transaction_amount,
                "note": report.note,
                "promoter_username": report.owner.username if report.owner else None
            }
            result.append(report_dict)
        return result
    finally:
        db.close()

@app.get("/admin/stats")
def admin_get_stats(admin: Promoter = Depends(get_admin_user)):
    """Get dashboard statistics (admin only)"""
    db = SessionLocal()
    try:
        total_promoters = db.query(Promoter).count()
        total_reports = db.query(Report).count()
        total_admins = db.query(Promoter).filter(Promoter.is_admin == True).count()
        
        # Get reports per team
        from sqlalchemy import func
        team_stats = db.query(
            Report.team_name,
            func.count(Report.id).label('count')
        ).group_by(Report.team_name).all()
        
        return {
            "total_promoters": total_promoters,
            "total_reports": total_reports,
            "total_admins": total_admins,
            "reports_per_team": {team: count for team, count in team_stats if team}
        }
    finally:
        db.close()

@app.get("/admin/live-locations")
def admin_get_live_locations(admin: Promoter = Depends(get_admin_user)):
    """Get live locations of all promoters (admin only)"""
    db = SessionLocal()
    try:
        promoters = db.query(Promoter).filter(
            Promoter.last_latitude.isnot(None),
            Promoter.last_longitude.isnot(None)
        ).order_by(Promoter.last_seen.desc()).all()

        now = datetime.utcnow()
        online_threshold = now - timedelta(minutes=7)
        today_date = now.date()
        
        result = []
        for p in promoters:
            last_seen_dt = p.last_seen or p.last_location_time
            is_online = False
            was_online_today = False
            if last_seen_dt:
                is_online = last_seen_dt >= online_threshold
                was_online_today = last_seen_dt.date() == today_date

            result.append({
                "id": p.id,
                "username": p.username,
                "full_name": p.full_name,
                "team_name": p.team_name,
                "profile_picture": p.profile_picture,
                "location": f"https://maps.google.com/?q={p.last_latitude},{p.last_longitude}",
                "latitude": p.last_latitude,
                "longitude": p.last_longitude,
                "timestamp": p.last_location_time.isoformat() + 'Z' if p.last_location_time else None,
                "last_seen": last_seen_dt.isoformat() + 'Z' if last_seen_dt else None,
                "is_online": is_online,
                "was_online_today": was_online_today
            })
        return result
    finally:
        db.close()


# ==================== LOCATION TRACKING ====================

class LocationUpdate(BaseModel):
    lat: float
    lng: float
    event_id: Optional[int] = None

@app.post("/api/promoters/location")
def update_promoter_location(loc: LocationUpdate, user: Promoter = Depends(get_current_user)):
    """Update promoter's live location and append to today's trail (admin live map)"""
    db = SessionLocal()
    try:
        db_user = db.query(Promoter).filter(Promoter.id == user.id).first()
        if not db_user:
            raise HTTPException(status_code=404, detail="User not found")

        db_user.last_latitude = loc.lat
        db_user.last_longitude = loc.lng
        db_user.last_location_time = datetime.utcnow()
        db_user.last_seen = datetime.utcnow()

        # Keep the movement trail (used by the admin live map) fresh, but cap
        # writes to once every 5 minutes so a 15s GPS ping doesn't flood the table.
        last_history = db.query(LocationHistory).filter(
            LocationHistory.promoter_id == user.id
        ).order_by(LocationHistory.timestamp.desc()).first()

        should_save = True
        if last_history:
            time_diff = (datetime.utcnow() - last_history.timestamp).total_seconds()
            if time_diff < 300:
                should_save = False

        if should_save:
            db.add(LocationHistory(
                promoter_id=user.id,
                latitude=loc.lat,
                longitude=loc.lng,
                event_id=loc.event_id or db_user.event_id
            ))

        db.commit()
        return {"ok": True}
    finally:
        db.close()

# ==================== TASK/ASSIGNMENT ENDPOINTS ====================

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    promoter_id: Optional[int] = None
    team_name: Optional[str] = None
    event_id: Optional[int] = None
    priority: str = "normal"
    due_date: Optional[str] = None

class TaskUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None

@app.post("/admin/tasks")
def create_task(task: TaskCreate, admin: Promoter = Depends(get_admin_user)):
    """Create a new task (admin only)"""
    db = SessionLocal()
    try:
        due_dt = None
        if task.due_date:
            try:
                due_dt = datetime.fromisoformat(task.due_date.replace('Z', '+00:00'))
            except:
                due_dt = None

        # Normalize optional fields
        normalized_team = None
        if task.team_name:
            stripped = task.team_name.strip()
            if stripped:
                normalized_team = stripped
        
        new_task = Task(
            title=task.title,
            description=task.description,
            promoter_id=task.promoter_id,
            team_name=normalized_team,
            event_id=task.event_id,
            priority=task.priority,
            due_date=due_dt,
            created_by=admin.id
        )
        db.add(new_task)
        db.commit()
        db.refresh(new_task)
        
        # Create notification for assigned user(s)
        if task.promoter_id:
            # Specific promoter
            notif = Notification(
                user_id=task.promoter_id,
                title="وظیفه جدید",
                message=f"وظیفه جدید: {task.title}",
                type="task",
                data=str({"task_id": new_task.id})
            )
            db.add(notif)
            db.commit()
        elif normalized_team:
            # All promoters in the team
            team_promoters = db.query(Promoter).filter(
                Promoter.is_admin == False
            ).all()
            for promoter in team_promoters:
                promoter_team = (promoter.team_name or "").strip()
                if promoter_team != normalized_team:
                    continue
                notif = Notification(
                    user_id=promoter.id,
                    title="وظیفه جدید تیمی",
                    message=f"وظیفه جدید برای تیم {normalized_team}: {task.title}",
                    type="task",
                    data=str({"task_id": new_task.id})
                )
                db.add(notif)
            db.commit()
        else:
            # Task for everyone in the same event - notify all non-admin promoters of that event
            query = db.query(Promoter).filter(Promoter.is_admin == False)
            if task.event_id:
                query = query.filter(Promoter.event_id == task.event_id)
            all_promoters = query.all()
            for promoter in all_promoters:
                notif = Notification(
                    user_id=promoter.id,
                    title="وظیفه جدید",
                    message=f"وظیفه جدید: {task.title}",
                    type="task",
                    data=str({"task_id": new_task.id})
                )
                db.add(notif)
            db.commit()
        
        return {"ok": True, "task_id": new_task.id}
    finally:
        db.close()

@app.get("/admin/tasks")
def get_all_tasks(event_id: Optional[int] = None, admin: Promoter = Depends(get_admin_user)):
    """Get all tasks (admin only)"""
    db = SessionLocal()
    try:
        query = db.query(Task)
        if event_id:
            query = query.filter(Task.event_id == event_id)
        tasks = query.order_by(Task.created_at.desc()).all()
        result = []
        for t in tasks:
            assignee = None
            if t.promoter_id:
                p = db.query(Promoter).filter(Promoter.id == t.promoter_id).first()
                if p:
                    assignee = {"id": p.id, "username": p.username, "full_name": p.full_name}
            
            result.append({
                "id": t.id,
                "title": t.title,
                "description": t.description,
                "status": t.status,
                "priority": t.priority,
                "team_name": t.team_name,
                "due_date": t.due_date.isoformat() + 'Z' if t.due_date else None,
                "created_at": t.created_at.isoformat() + 'Z' if t.created_at else None,
                "completed_at": t.completed_at.isoformat() + 'Z' if t.completed_at else None,
                "assignee": assignee
            })
        return result
    finally:
        db.close()

@app.get("/tasks/my")
def get_my_tasks(user: Promoter = Depends(get_current_user)):
    """Get tasks assigned to current user — filtered by user's event_id"""
    db = SessionLocal()
    try:
        from sqlalchemy import or_, and_

        user_event_id = user.event_id
        user_team = (user.team_name or "").strip()

        # Base: tasks that belong to this user's event (or have no event)
        event_filter = or_(
            Task.event_id == user_event_id,
            Task.event_id == None
        ) if user_event_id else Task.event_id == None

        # Who the task is assigned to
        assignee_conditions = [
            Task.promoter_id == user.id,
        ]
        if user_team:
            assignee_conditions.append(Task.team_name == user_team)
        # global tasks (no specific promoter or team)
        assignee_conditions.append(
            and_(Task.promoter_id == None, Task.team_name == None)
        )
        assignee_conditions.append(
            and_(Task.promoter_id == None, Task.team_name == "")
        )

        tasks = db.query(Task).filter(
            event_filter,
            or_(*assignee_conditions)
        ).order_by(Task.created_at.desc()).all()

        result = []
        for t in tasks:
            result.append({
                "id": t.id,
                "title": t.title,
                "description": t.description,
                "status": t.status,
                "priority": t.priority,
                "due_date": t.due_date.isoformat() + 'Z' if t.due_date else None,
                "created_at": t.created_at.isoformat() + 'Z' if t.created_at else None
            })
        return result
    finally:
        db.close()

@app.put("/tasks/{task_id}")
def update_task(task_id: int, data: TaskUpdate, user: Promoter = Depends(get_current_user)):
    """Update task status"""
    db = SessionLocal()
    try:
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

        # A promoter may only update a task that's actually theirs: assigned to
        # them, or a broadcast task (no promoter) in their event/team — the same
        # scope /tasks/my lists. Previously any logged-in user could flip any task.
        if not user.is_admin:
            in_event = task.event_id is None or task.event_id == user.event_id
            user_team = (user.team_name or "").strip()
            is_mine = task.promoter_id == user.id or (in_event and (
                (user_team and task.team_name == user_team) or
                (task.promoter_id is None and not task.team_name)
            ))
            if not is_mine:
                raise HTTPException(status_code=403, detail="Not authorized to update this task")
            if data.status and data.status not in ("pending", "in_progress", "completed"):
                raise HTTPException(status_code=400, detail="Invalid status")

        if data.status:
            task.status = data.status
            if data.status == "completed":
                task.completed_at = datetime.utcnow()
        if data.priority and user.is_admin:
            task.priority = data.priority
        if data.title and user.is_admin:
            task.title = data.title
        if data.description and user.is_admin:
            task.description = data.description
            
        db.commit()
        return {"ok": True}
    finally:
        db.close()

@app.delete("/admin/tasks/{task_id}")
def delete_task(task_id: int, admin: Promoter = Depends(get_admin_user)):
    """Delete a task (admin only)"""
    db = SessionLocal()
    try:
        task = db.query(Task).filter(Task.id == task_id).first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        db.delete(task)
        db.commit()
        return {"ok": True}
    finally:
        db.close()


# ==================== INVENTORY ENDPOINTS ====================

class InventoryItemCreate(BaseModel):
    name: str
    description: Optional[str] = None
    promoter_id: Optional[int] = None
    event_id: Optional[int] = None
    status: str = "pending"
    archive_item_id: Optional[int] = None

class InventoryItemUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    promoter_id: Optional[int] = None
    status: Optional[str] = None

class InventoryStatusUpdate(BaseModel):
    status: str
    condition: Optional[str] = None
    notes: Optional[str] = None

class FlagImageRequest(BaseModel):
    field_id: str
    index: Optional[int] = None
    reason: str

# ==================== GLOBAL EQUIPMENT ARCHIVE MODELS ====================

EQUIPMENT_STATUS_KEYS = ["in_stock", "in_use", "in_office", "needs_repair"]

class EquipmentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    item_code: Optional[str] = None   # اگر خالی بود، auto-generate میشه
    status: str = "in_stock"          # in_stock | in_use | needs_repair
    owner_type: str = "vu"            # "vu" | "client"
    client_id: Optional[int] = None
    client_name: Optional[str] = None
    quantity: int = 1                 # تعداد کل واحدها

class EquipmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    item_code: Optional[str] = None
    status: Optional[str] = None
    owner_type: Optional[str] = None
    client_id: Optional[int] = None
    client_name: Optional[str] = None
    quantity: Optional[int] = None

class EquipmentMoveUnits(BaseModel):
    from_status: str
    to_status: str
    count: int = 1

def _normalize_status_counts(item):
    """Return a full {status: count} dict for an item, synthesizing it for legacy rows."""
    counts = dict(item.status_counts) if item.status_counts else None
    if not counts:
        counts = {k: 0 for k in EQUIPMENT_STATUS_KEYS}
        counts[item.status if item.status in EQUIPMENT_STATUS_KEYS else "in_stock"] = item.quantity or 1
    else:
        for k in EQUIPMENT_STATUS_KEYS:
            counts.setdefault(k, 0)
    return counts

@app.get("/admin/equipment")
def get_all_equipment(
    status: Optional[str] = None,
    owner_type: Optional[str] = None,
    search: Optional[str] = None,
    admin: Promoter = Depends(get_admin_user)
):
    db = SessionLocal()
    try:
        # آرشیو کلی: فقط تجهیزاتی که event_id ندارند (global equipment)
        query = db.query(InventoryItem).filter(InventoryItem.event_id.is_(None))
        if owner_type:
            query = query.filter(InventoryItem.owner_type == owner_type)
        if search:
            query = query.filter(
                (InventoryItem.name.ilike(f"%{search}%")) |
                (InventoryItem.item_code.ilike(f"%{search}%"))
            )
        items = query.order_by(InventoryItem.id.desc()).all()
        result = []
        for i in items:
            counts = _normalize_status_counts(i)
            if status and counts.get(status, 0) <= 0:
                continue
            result.append({
                "id": i.id,
                "name": i.name,
                "description": i.description,
                "item_code": i.item_code,
                "status": i.status,
                "quantity": i.quantity or 1,
                "status_counts": counts,
                "owner_type": i.owner_type or "vu",
                "client_id": i.client_id,
                "client_name": i.client_name,
                "assigned_at": i.assigned_at.isoformat() + 'Z' if i.assigned_at else None,
                "updated_at": i.updated_at.isoformat() + 'Z' if i.updated_at else None,
            })
        return result
    finally:
        db.close()

@app.post("/admin/equipment")
def create_equipment(data: EquipmentCreate, admin: Promoter = Depends(get_admin_user)):
    db = SessionLocal()
    try:
        # Auto-generate item_code if not provided
        item_code = data.item_code
        if not item_code:
            last = db.query(InventoryItem).filter(
                InventoryItem.event_id == None,
                InventoryItem.item_code.isnot(None)
            ).order_by(InventoryItem.id.desc()).first()
            last_num = 0
            if last and last.item_code:
                try:
                    last_num = int(last.item_code.split("-")[-1])
                except Exception:
                    pass
            item_code = f"EQ-{str(last_num + 1).zfill(3)}"

        # Resolve client_name if client_id provided
        client_name = data.client_name
        if data.client_id and not client_name:
            client = db.query(Client).filter(Client.id == data.client_id).first()
            if client:
                client_name = client.name

        quantity = max(1, data.quantity or 1)
        status_counts = {k: 0 for k in EQUIPMENT_STATUS_KEYS}
        status_counts[data.status if data.status in EQUIPMENT_STATUS_KEYS else "in_stock"] = quantity

        new_item = InventoryItem(
            name=data.name,
            description=data.description,
            item_code=item_code,
            status=data.status,
            owner_type=data.owner_type,
            client_id=data.client_id if data.owner_type == "client" else None,
            client_name=client_name if data.owner_type == "client" else None,
            event_id=None,
            quantity=quantity,
            status_counts=status_counts,
        )
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        return {
            "ok": True,
            "id": new_item.id,
            "item_code": new_item.item_code,
        }
    finally:
        db.close()

@app.put("/admin/equipment/{item_id}")
def update_equipment(item_id: int, data: EquipmentUpdate, admin: Promoter = Depends(get_admin_user)):
    db = SessionLocal()
    try:
        item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail="Equipment not found")
        if data.name is not None:
            item.name = data.name
        if data.description is not None:
            item.description = data.description
        if data.item_code is not None:
            item.item_code = data.item_code
        if data.status is not None:
            item.status = data.status
        if data.owner_type is not None:
            item.owner_type = data.owner_type
        if data.owner_type == "vu":
            item.client_id = None
            item.client_name = None
        else:
            if data.client_id is not None:
                item.client_id = data.client_id
                # refresh client_name
                if data.client_name:
                    item.client_name = data.client_name
                else:
                    client = db.query(Client).filter(Client.id == data.client_id).first()
                    item.client_name = client.name if client else None
        if data.quantity is not None:
            new_quantity = max(1, data.quantity)
            counts = _normalize_status_counts(item)
            old_quantity = item.quantity or 1
            diff = new_quantity - old_quantity
            if diff > 0:
                counts["in_stock"] = counts.get("in_stock", 0) + diff
            elif diff < 0:
                need = -diff
                if counts.get("in_stock", 0) < need:
                    raise HTTPException(
                        status_code=400,
                        detail="برای کاهش تعداد، ابتدا واحدهای کافی را به «در انبار» برگردانید"
                    )
                counts["in_stock"] -= need
            item.quantity = new_quantity
            item.status_counts = counts
        item.updated_at = datetime.utcnow()
        db.commit()
        return {"ok": True}
    finally:
        db.close()

@app.put("/admin/equipment/{item_id}/move")
def move_equipment_units(item_id: int, data: EquipmentMoveUnits, admin: Promoter = Depends(get_admin_user)):
    """جابجایی تعدادی واحد از یک وضعیت به وضعیت دیگر برای یک تجهیز (مثلاً یک یخچال را وارد «در حال استفاده» کن)."""
    db = SessionLocal()
    try:
        item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail="Equipment not found")
        if data.from_status not in EQUIPMENT_STATUS_KEYS or data.to_status not in EQUIPMENT_STATUS_KEYS:
            raise HTTPException(status_code=400, detail="وضعیت نامعتبر است")
        if data.from_status == data.to_status:
            raise HTTPException(status_code=400, detail="وضعیت مبدا و مقصد نمی‌توانند یکسان باشند")
        if data.count < 1:
            raise HTTPException(status_code=400, detail="تعداد باید حداقل ۱ باشد")

        counts = _normalize_status_counts(item)
        if counts.get(data.from_status, 0) < data.count:
            raise HTTPException(status_code=400, detail=f"تعداد کافی در وضعیت مبدا موجود نیست")

        counts[data.from_status] -= data.count
        counts[data.to_status] = counts.get(data.to_status, 0) + data.count
        item.status_counts = counts

        # وضعیت غالب (بیشترین تعداد) برای فیلترها و نمایش خلاصه بروزرسانی می‌شود
        item.status = max(counts, key=counts.get)
        item.updated_at = datetime.utcnow()
        db.commit()
        return {"ok": True, "status_counts": counts}
    finally:
        db.close()

@app.delete("/admin/equipment/{item_id}")
def delete_equipment(item_id: int, admin: Promoter = Depends(get_admin_user)):
    db = SessionLocal()
    try:
        item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail="Equipment not found")
        db.delete(item)
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.post("/admin/inventory")
def create_inventory_item(item: InventoryItemCreate, admin: Promoter = Depends(get_admin_user)):
    db = SessionLocal()
    try:
        new_item = InventoryItem(
            name=item.name,
            description=item.description,
            promoter_id=item.promoter_id,
            event_id=item.event_id,
            status=item.status,
            archive_item_id=item.archive_item_id
        )
        if item.archive_item_id:
            archive_item = db.query(InventoryItem).filter(InventoryItem.id == item.archive_item_id).first()
            if archive_item:
                archive_item.status = "in_use"
                new_item.item_code = archive_item.item_code
                
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        return {"ok": True, "id": new_item.id}
    finally:
        db.close()

@app.get("/admin/inventory")
def get_all_inventory(event_id: Optional[int] = None, admin: Promoter = Depends(get_admin_user)):
    db = SessionLocal()
    try:
        query = db.query(InventoryItem)
        if event_id:
            query = query.filter(InventoryItem.event_id == event_id)
        items = query.order_by(InventoryItem.updated_at.desc()).all()
        result = []
        for i in items:
            promoter_name = None
            if i.promoter_id:
                promoter = db.query(Promoter).filter(Promoter.id == i.promoter_id).first()
                if promoter:
                    promoter_name = promoter.full_name or promoter.username
            
            result.append({
                "id": i.id,
                "name": i.name,
                "description": i.description,
                "promoter_id": i.promoter_id,
                "promoter_name": promoter_name,
                "status": i.status,
                "item_code": i.item_code,
                "archive_item_id": i.archive_item_id,
                "assigned_at": i.assigned_at.isoformat() + 'Z' if i.assigned_at else None,
                "updated_at": i.updated_at.isoformat() + 'Z' if i.updated_at else None
            })
        return result
    finally:
        db.close()

@app.put("/admin/inventory/{item_id}")
def update_inventory_item(item_id: int, data: InventoryItemUpdate, admin: Promoter = Depends(get_admin_user)):
    db = SessionLocal()
    try:
        item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail="Item not found")
        
        if data.name is not None:
            item.name = data.name
        if data.description is not None:
            item.description = data.description
        if data.promoter_id is not None:
            item.promoter_id = data.promoter_id
        if data.status is not None:
            if item.status != data.status:
                item.status = data.status
                if item.archive_item_id:
                    archive_item = db.query(InventoryItem).filter(InventoryItem.id == item.archive_item_id).first()
                    if archive_item:
                        if data.status == "returned":
                            archive_item.status = "in_stock"
                        elif data.status == "lost":
                            archive_item.status = "needs_repair"
                        else:
                            archive_item.status = "in_use"
            
        item.updated_at = datetime.utcnow()
        db.commit()
        return {"ok": True}
    finally:
        db.close()

@app.delete("/admin/inventory/{item_id}")
def delete_inventory_item(item_id: int, admin: Promoter = Depends(get_admin_user)):
    db = SessionLocal()
    try:
        item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail="Item not found")
            
        if item.archive_item_id:
            archive_item = db.query(InventoryItem).filter(InventoryItem.id == item.archive_item_id).first()
            if archive_item:
                archive_item.status = "in_stock"
                
        db.delete(item)
        db.commit()
        return {"ok": True}
    finally:
        db.close()

@app.get("/inventory/my")
def get_my_inventory(user: Promoter = Depends(get_current_user)):
    db = SessionLocal()
    try:
        items = db.query(InventoryItem).filter(InventoryItem.promoter_id == user.id).order_by(InventoryItem.updated_at.desc()).all()
        result = []
        for i in items:
            result.append({
                "id": i.id,
                "name": i.name,
                "description": i.description,
                "status": i.status,
                "assigned_at": i.assigned_at.isoformat() + 'Z' if i.assigned_at else None,
                "updated_at": i.updated_at.isoformat() + 'Z' if i.updated_at else None
            })
        return result
    finally:
        db.close()

@app.put("/inventory/{item_id}/status")
def update_my_inventory_status(item_id: int, data: InventoryStatusUpdate, user: Promoter = Depends(get_current_user)):
    db = SessionLocal()
    try:
        item = db.query(InventoryItem).filter(InventoryItem.id == item_id, InventoryItem.promoter_id == user.id).first()
        if not item:
            raise HTTPException(status_code=404, detail="Item not found or not assigned to you")
        
        if item.status != data.status:
            item.status = data.status
            if item.archive_item_id:
                archive_item = db.query(InventoryItem).filter(InventoryItem.id == item.archive_item_id).first()
                if archive_item:
                    if data.status == "returned":
                        archive_item.status = "in_stock"
                    elif data.status == "lost":
                        archive_item.status = "needs_repair"
                    else:
                        archive_item.status = "in_use"

        item.updated_at = datetime.utcnow()
        db.commit()
        return {"ok": True}
    finally:
        db.close()

# ==================== NOTIFICATION ENDPOINTS ====================

class NotificationCreate(BaseModel):
    user_id: Optional[int] = None  # null = broadcast to all
    title: str
    message: str
    type: str = "info"

@app.post("/admin/notifications")
def create_notification(notif: NotificationCreate, admin: Promoter = Depends(get_admin_user)):
    """Create notification (admin only)"""
    db = SessionLocal()
    try:
        new_notif = Notification(
            user_id=notif.user_id,
            title=notif.title,
            message=notif.message,
            type=notif.type
        )
        db.add(new_notif)
        db.commit()
        return {"ok": True, "notification_id": new_notif.id}
    finally:
        db.close()

@app.get("/notifications")
def get_my_notifications(user: Promoter = Depends(get_current_user)):
    """Get notifications for current user"""
    db = SessionLocal()
    try:
        notifications = db.query(Notification).filter(
            (Notification.user_id == user.id) | (Notification.user_id == None)
        ).order_by(Notification.created_at.desc()).limit(50).all()
        
        result = []
        for n in notifications:
            result.append({
                "id": n.id,
                "title": n.title,
                "message": n.message,
                "type": n.type,
                "is_read": n.is_read,
                "created_at": n.created_at.isoformat() + 'Z' if n.created_at else None,
                "data": n.data
            })
        return result
    finally:
        db.close()

@app.put("/notifications/{notif_id}/read")
def mark_notification_read(notif_id: int, user: Promoter = Depends(get_current_user)):
    """Mark notification as read"""
    db = SessionLocal()
    try:
        notif = db.query(Notification).filter(Notification.id == notif_id).first()
        if notif:
            notif.is_read = True
            db.commit()
        return {"ok": True}
    finally:
        db.close()

@app.get("/notifications/unread-count")
def get_unread_count(user: Promoter = Depends(get_current_user)):
    """Get count of unread notifications"""
    db = SessionLocal()
    try:
        count = db.query(Notification).filter(
            ((Notification.user_id == user.id) | (Notification.user_id == None)) &
            (Notification.is_read == False)
        ).count()
        return {"count": count}
    finally:
        db.close()


# ==================== LOCATION HISTORY ENDPOINTS ====================

@app.get("/admin/location-history/{promoter_id}")
def get_location_history(promoter_id: int, date: Optional[str] = None, admin: Promoter = Depends(get_admin_user)):
    """Get location history for a promoter (admin only)"""
    db = SessionLocal()
    try:
        query = db.query(LocationHistory).filter(LocationHistory.promoter_id == promoter_id)
        
        if date:
            try:
                target_date = datetime.strptime(date, "%Y-%m-%d").date()
                query = query.filter(
                    LocationHistory.timestamp >= datetime.combine(target_date, datetime.min.time()),
                    LocationHistory.timestamp <= datetime.combine(target_date, datetime.max.time())
                )
            except:
                pass
        
        history = query.order_by(LocationHistory.timestamp.asc()).all()
        
        result = []
        for h in history:
            result.append({
                "id": h.id,
                "latitude": h.latitude,
                "longitude": h.longitude,
                "timestamp": h.timestamp.isoformat() + 'Z' if h.timestamp else None
            })
        return result
    finally:
        db.close()


# ==================== EXCEL EXPORT ENDPOINT ====================

@app.get("/admin/reports/export-excel")
def export_reports_excel(
    team: Optional[str] = None,
    promoter: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    admin: Promoter = Depends(get_admin_user)
):
    """Export reports to Excel file"""
    try:
        import openpyxl
        from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
    except ImportError:
        raise HTTPException(status_code=500, detail="openpyxl not installed")
    
    db = SessionLocal()
    try:
        query = db.query(Report).order_by(Report.id.desc())
        
        if team:
            query = query.filter(Report.team_name == team)
        if promoter:
            query = query.filter(Report.promoter_name == promoter)
        if date_from:
            query = query.filter(Report.date >= date_from)
        if date_to:
            query = query.filter(Report.date <= date_to)
        
        reports = query.all()
        
        # Create Excel workbook
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "گزارش‌ها"
        ws.sheet_view.rightToLeft = True
        
        # Headers
        headers = ["ردیف", "تاریخ", "ساعت", "تیم", "پروموتر", "سوپروایزر", "فروشگاه", 
                   "نوع کسب‌وکار", "شماره فروشنده", "مبلغ تراکنش", "تخفیف", "یادداشت"]
        
        header_fill = PatternFill(start_color="3E3663", end_color="3E3663", fill_type="solid")
        header_font = Font(color="FFFFFF", bold=True, size=11)
        
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col, value=header)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", vertical="center")
        
        # Data rows
        for row_idx, report in enumerate(reports, 2):
            ws.cell(row=row_idx, column=1, value=row_idx - 1)
            ws.cell(row=row_idx, column=2, value=report.date)
            ws.cell(row=row_idx, column=3, value=report.time)
            ws.cell(row=row_idx, column=4, value=report.team_name)
            ws.cell(row=row_idx, column=5, value=report.promoter_name)
            ws.cell(row=row_idx, column=6, value=report.supervisor_name)
            ws.cell(row=row_idx, column=7, value=report.store_name)
            ws.cell(row=row_idx, column=8, value=report.business_type)
            ws.cell(row=row_idx, column=9, value=report.seller_number)
            ws.cell(row=row_idx, column=10, value=report.transaction_amount)
            ws.cell(row=row_idx, column=11, value=report.discount_amount)
            ws.cell(row=row_idx, column=12, value=report.note)
        
        # Adjust column widths
        for col in range(1, 13):
            ws.column_dimensions[openpyxl.utils.get_column_letter(col)].width = 15
        
        # Save to bytes
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        
        filename = f"reports_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    finally:
        db.close()


# ==================== DASHBOARD ANALYTICS ====================

@app.get("/admin/analytics")
def get_analytics(admin: Promoter = Depends(get_admin_user)):
    """Get advanced analytics for dashboard"""
    db = SessionLocal()
    try:
        from sqlalchemy import func
        
        now = datetime.utcnow()
        today = now.date()
        week_ago = today - timedelta(days=7)
        month_ago = today - timedelta(days=30)
        
        # Daily reports for last 7 days
        daily_reports = []
        for i in range(7):
            date = today - timedelta(days=i)
            date_str = date.strftime("%Y-%m-%d")
            count = db.query(Report).filter(Report.date == date_str).count()
            amount = db.query(func.sum(Report.transaction_amount)).filter(Report.date == date_str).scalar() or 0
            daily_reports.append({
                "date": date_str,
                "count": count,
                "amount": float(amount) if amount else 0
            })
        
        # Reports per team
        team_stats = db.query(
            Report.team_name,
            func.count(Report.id).label('count'),
            func.sum(Report.transaction_amount).label('amount')
        ).group_by(Report.team_name).all()
        
        teams_data = []
        for team, count, amount in team_stats:
            if team:
                teams_data.append({
                    "team": team,
                    "count": count,
                    "amount": float(amount) if amount else 0
                })
        
        # Top promoters
        promoter_stats = db.query(
            Report.promoter_name,
            func.count(Report.id).label('count'),
            func.sum(Report.transaction_amount).label('amount')
        ).group_by(Report.promoter_name).order_by(func.count(Report.id).desc()).limit(10).all()
        
        top_promoters = []
        for name, count, amount in promoter_stats:
            if name:
                top_promoters.append({
                    "name": name,
                    "count": count,
                    "amount": float(amount) if amount else 0
                })
        
        # Online stats
        online_threshold = now - timedelta(minutes=7)
        online_count = db.query(Promoter).filter(
            Promoter.last_seen >= online_threshold,
            Promoter.is_admin == False
        ).count()
        
        today_active = db.query(Promoter).filter(
            Promoter.last_seen >= datetime.combine(today, datetime.min.time()),
            Promoter.is_admin == False
        ).count()
        
        return {
            "daily_reports": list(reversed(daily_reports)),
            "teams_data": teams_data,
            "top_promoters": top_promoters,
            "online_count": online_count,
            "today_active": today_active
        }
    finally:
        db.close()


# ==================== AI ANALYSIS ====================

class AIAnalysisRequest(BaseModel):
    query: str
    include_reports: bool = True
    include_promoters: bool = True
    include_teams: bool = True
    date_from: Optional[str] = None
    date_to: Optional[str] = None

@app.post("/admin/ai-analyze")
def ai_analyze(request: AIAnalysisRequest, admin: Promoter = Depends(get_admin_user)):
    """
    AI Analysis endpoint - Gathers data for AI processing
    TODO: Connect to actual AI service (OpenAI, etc.)
    """
    db = SessionLocal()
    try:
        from sqlalchemy import func
        
        now = datetime.utcnow()
        today = now.date()
        
        # Prepare data context for AI
        context_data = {
            "query": request.query,
            "timestamp": now.isoformat() + 'Z',
            "summary": {}
        }
        
        # Get report statistics
        if request.include_reports:
            total_reports = db.query(Report).count()
            
            # Filter by date if provided
            reports_query = db.query(Report)
            if request.date_from:
                reports_query = reports_query.filter(Report.date >= request.date_from)
            if request.date_to:
                reports_query = reports_query.filter(Report.date <= request.date_to)
            
            filtered_reports = reports_query.all()
            
            # Helper function to safely convert transaction_amount to float
            def safe_amount(val):
                if val is None:
                    return 0
                try:
                    return float(val)
                except (ValueError, TypeError):
                    return 0
            
            total_amount = sum([safe_amount(r.transaction_amount) for r in filtered_reports])
            
            # Recent 7 days trend
            daily_data = []
            for i in range(7):
                date = today - timedelta(days=i)
                date_str = date.strftime("%Y-%m-%d")
                day_reports = [r for r in filtered_reports if r.date == date_str]
                daily_data.append({
                    "date": date_str,
                    "count": len(day_reports),
                    "amount": sum([safe_amount(r.transaction_amount) for r in day_reports])
                })
            
            context_data["summary"]["reports"] = {
                "total": total_reports,
                "filtered": len(filtered_reports),
                "total_amount": float(total_amount),
                "daily_trend": list(reversed(daily_data))
            }
        
        # Get promoter statistics
        if request.include_promoters:
            total_promoters = db.query(Promoter).filter(Promoter.is_admin == False).count()
            
            # Online count
            online_threshold = now - timedelta(minutes=7)
            online_count = db.query(Promoter).filter(
                Promoter.last_seen >= online_threshold,
                Promoter.is_admin == False
            ).count()
            
            # Top performers
            promoter_stats = db.query(
                Report.promoter_name,
                func.count(Report.id).label('count'),
                func.sum(Report.transaction_amount).label('amount')
            ).group_by(Report.promoter_name).order_by(func.count(Report.id).desc()).limit(5).all()
            
            top_performers = [
                {"name": name, "reports": count, "amount": float(amount) if amount else 0}
                for name, count, amount in promoter_stats if name
            ]
            
            context_data["summary"]["promoters"] = {
                "total": total_promoters,
                "online": online_count,
                "top_performers": top_performers
            }
        
        # Get team statistics
        if request.include_teams:
            team_stats = db.query(
                Report.team_name,
                func.count(Report.id).label('count'),
                func.sum(Report.transaction_amount).label('amount')
            ).group_by(Report.team_name).all()
            
            teams = [
                {"name": team, "reports": count, "amount": float(amount) if amount else 0}
                for team, count, amount in team_stats if team
            ]
            
            context_data["summary"]["teams"] = {
                "count": len(teams),
                "data": teams
            }
        
        # TODO: Send context_data to AI service
        # Example with OpenAI:
        # response = openai.ChatCompletion.create(
        #     model="gpt-4",
        #     messages=[
        #         {"role": "system", "content": "You are an analytics assistant for a promoter management system."},
        #         {"role": "user", "content": f"Based on this data: {json.dumps(context_data['summary'])}, answer: {request.query}"}
        #     ]
        # )
        # ai_response = response.choices[0].message.content
        
        # For now, return placeholder response with the context data
        ai_response = f"""📊 تحلیل درخواستی شما:

سوال: {request.query}

📈 خلاصه داده‌ها:
- تعداد کل گزارش‌ها: {context_data['summary'].get('reports', {}).get('total', 'N/A')}
- مجموع تراکنش‌ها: {context_data['summary'].get('reports', {}).get('total_amount', 0):,.0f} تومان
- تعداد پروموترها: {context_data['summary'].get('promoters', {}).get('total', 'N/A')}
- آنلاین الان: {context_data['summary'].get('promoters', {}).get('online', 0)}
- تعداد تیم‌ها: {context_data['summary'].get('teams', {}).get('count', 'N/A')}

⚠️ توجه: این پاسخ موقت است. برای فعال‌سازی هوش مصنوعی واقعی، API کلید OpenAI یا سرویس AI دیگر را تنظیم کنید.

💡 برای اتصال به AI:
1. کلید API را در فایل .env اضافه کنید
2. کد مربوط به AI را در این endpoint فعال کنید"""
        
        return {
            "ok": True,
            "query": request.query,
            "response": ai_response,
            "context": context_data["summary"],
            "timestamp": now.isoformat() + 'Z'
        }
        
    finally:
        db.close()


# ==================== EVENT ENDPOINTS ====================

class EventCreate(BaseModel):
    name: str
    slug: str
    fields: list
    setup_pre_fields: list = []
    setup_post_fields: list = []
    mobile_columns: int = 2
    desktop_columns: int = 3
    enable_voice: bool = True
    enable_chat: bool = False
    client_name: Optional[str] = None
    start_date: Optional[str] = None
    start_time: Optional[str] = None
    end_date: Optional[str] = None
    end_time: Optional[str] = None
    promoter_count: int = 0
    requires_setup: bool = False
    setup_count: int = 0
    setup_date: Optional[str] = None
    setup_time_in: Optional[str] = None
    setup_time_out: Optional[str] = None
    requires_collection: bool = False
    collection_count: int = 0
    collection_date: Optional[str] = None
    collection_time_in: Optional[str] = None
    collection_time_out: Optional[str] = None
    requires_supervisor: bool = False
    supervisor_count: int = 0
    requires_transport: bool = False
    transport_count: int = 0
    requires_sampling: bool = False
    sampling_count: int = 0
    location: Optional[str] = None
    report_location: Optional[str] = None
    report_location_image: Optional[str] = None
    location_label: Optional[str] = None
    description: Optional[str] = None
    event_type: Optional[str] = None
    custom_times: Optional[dict] = None


class ReportPhotosUpdate(BaseModel):
    photos: List[str]


@app.post("/admin/templates")
def create_event_template(template: EventTemplateCreate, user: Promoter = Depends(get_current_user)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    db = SessionLocal()
    try:
        existing = db.query(EventTemplate).filter(EventTemplate.name == template.name).first()
        if existing:
            raise HTTPException(status_code=400, detail="قالبی با این نام از قبل وجود دارد")
        
        new_tpl = EventTemplate(
            name=template.name,
            description=template.description,
            sections=template.sections
        )
        db.add(new_tpl)
        db.commit()
        db.refresh(new_tpl)
        return {"ok": True, "id": new_tpl.id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating template: {e}")
        raise HTTPException(status_code=500, detail="Error creating template")
    finally:
        db.close()

@app.get("/admin/templates", response_model=List[EventTemplateOut])
def get_event_templates(user: Promoter = Depends(get_current_user)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    db = SessionLocal()
    try:
        templates = db.query(EventTemplate).order_by(EventTemplate.created_at.desc()).all()
        return templates
    finally:
        db.close()


@app.put("/admin/templates/{template_id}")
def update_event_template(template_id: int, template: EventTemplateCreate, user: Promoter = Depends(get_current_user)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    db = SessionLocal()
    try:
        tpl = db.query(EventTemplate).filter(EventTemplate.id == template_id).first()
        if not tpl:
            raise HTTPException(status_code=404, detail="قالب پیدا نشد")
        # Check name collision with other templates
        conflict = db.query(EventTemplate).filter(
            EventTemplate.name == template.name,
            EventTemplate.id != template_id
        ).first()
        if conflict:
            raise HTTPException(status_code=400, detail="قالبی با این نام از قبل وجود دارد")
        tpl.name = template.name
        tpl.description = template.description
        tpl.sections = template.sections
        db.commit()
        db.refresh(tpl)
        return {"ok": True, "id": tpl.id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating template: {e}")
        raise HTTPException(status_code=500, detail="Error updating template")
    finally:
        db.close()


@app.delete("/admin/templates/{template_id}")
def delete_event_template(template_id: int, user: Promoter = Depends(get_current_user)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    db = SessionLocal()
    try:
        tpl = db.query(EventTemplate).filter(EventTemplate.id == template_id).first()
        if not tpl:
            raise HTTPException(status_code=404, detail="قالب پیدا نشد")
        db.delete(tpl)
        db.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting template: {e}")
        raise HTTPException(status_code=500, detail="Error deleting template")
    finally:
        db.close()



@app.post("/admin/events")
def create_event(data: EventCreate, admin: Promoter = Depends(get_admin_user)):
    db = SessionLocal()
    try:
        if db.query(Event).filter(Event.slug == data.slug).first():
            raise HTTPException(status_code=400, detail="slug already exists")
        event = Event(
            name=data.name,
            slug=data.slug,
            fields=data.fields,
            setup_pre_fields=data.setup_pre_fields,
            setup_post_fields=data.setup_post_fields,
            mobile_columns=data.mobile_columns,
            desktop_columns=data.desktop_columns,
            enable_voice=data.enable_voice,
            enable_chat=data.enable_chat,
            client_name=data.client_name,
            start_date=data.start_date,
            start_time=data.start_time,
            end_date=data.end_date,
            end_time=data.end_time,
            promoters_needed=data.promoter_count,
            requires_setup=data.requires_setup,
            setup_count=data.setup_count,
            setup_date=data.setup_date,
            setup_time_in=data.setup_time_in,
            setup_time_out=data.setup_time_out,
            requires_collection=data.requires_collection,
            collection_count=data.collection_count,
            collection_date=data.collection_date,
            collection_time_in=data.collection_time_in,
            collection_time_out=data.collection_time_out,
            requires_supervisor=data.requires_supervisor,
            supervisor_count=data.supervisor_count,
            requires_transport=data.requires_transport,
            transport_count=data.transport_count,
            requires_sampling=data.requires_sampling,
            sampling_count=data.sampling_count,
            location=data.location,
            description=data.description,
            event_type=data.event_type,
            custom_times=data.custom_times,
            report_location=data.report_location,
            report_location_image=data.report_location_image,
            location_label=data.location_label,
            created_by=admin.id
        )
        db.add(event)
        db.commit()
        db.refresh(event)
        return {"ok": True, "id": event.id, "slug": event.slug}
    finally:
        db.close()

@app.get("/events/public")
def list_public_events():
    db = SessionLocal()
    try:
        events = db.query(Event).filter(Event.is_archived == False).order_by(Event.is_active.desc(), Event.created_at.desc()).all()
        # Cheap logo lookup: events only cache the client's name (free-typed, no FK),
        # so match it back to a Client row by name to attach its logo.
        logos_by_name = {
            c.name.strip().lower(): c.logo_url
            for c in db.query(Client).filter(Client.logo_url.isnot(None)).all()
        }
        return [{"id": e.id, "name": e.name, "slug": e.slug,
                 "is_active": e.is_active,
                 "start_date": e.start_date, "end_date": e.end_date,
                 "start_time": getattr(e, 'start_time', None),
                 "end_time": getattr(e, 'end_time', None),
                 "custom_times": getattr(e, 'custom_times', None),
                 "location": getattr(e, 'location', None),
                 "client_name": getattr(e, 'client_name', None),
                 "client_logo": logos_by_name.get((e.client_name or '').strip().lower()),
                 "description": getattr(e, 'description', None)} for e in events]
    finally:
        db.close()


@app.get("/admin/events")
def list_events(admin: Promoter = Depends(get_panel_user)):
    db = SessionLocal()
    try:
        events = [e for e in db.query(Event).order_by(Event.created_at.desc()).all() if _event_in_scope(admin, e)]
        approval_clients = _approval_clients(db) if admin.is_admin else set()
        pending = _pending_approval_counts(db, [e.id for e in events if (e.client_name or '').strip().lower() in approval_clients])
        # Logo lookup – same approach as the public endpoint
        logos_by_name = {
            c.name.strip().lower(): c.logo_url
            for c in db.query(Client).filter(Client.logo_url.isnot(None)).all()
        }
        return [{"id": e.id, "name": e.name, "slug": e.slug, "is_active": e.is_active, "client_approved": getattr(e, 'client_approved', False),
                 "is_archived": getattr(e, 'is_archived', False),
                 "mobile_columns": e.mobile_columns, "desktop_columns": e.desktop_columns,
                 "enable_voice": e.enable_voice, "enable_chat": getattr(e, 'enable_chat', False),
                 "fields": e.fields, "setup_pre_fields": getattr(e, 'setup_pre_fields', []), "setup_post_fields": getattr(e, 'setup_post_fields', []), "created_at": e.created_at.isoformat() + 'Z' if e.created_at else None,
                 "client_name": e.client_name, "client_logo": logos_by_name.get((e.client_name or '').strip().lower()),
                 "start_date": e.start_date, "start_time": e.start_time,
                 "end_date": e.end_date, "end_time": e.end_time,
                 "promoter_count": e.promoters_needed, "requires_setup": e.requires_setup, "setup_count": getattr(e, 'setup_count', 0),
                 "setup_date": getattr(e, 'setup_date', None), "setup_time_in": getattr(e, 'setup_time_in', None), "setup_time_out": getattr(e, 'setup_time_out', None),
                 "requires_collection": getattr(e, 'requires_collection', False), "collection_count": getattr(e, 'collection_count', 0),
                 "collection_date": getattr(e, 'collection_date', None), "collection_time_in": getattr(e, 'collection_time_in', None), "collection_time_out": getattr(e, 'collection_time_out', None),
                 "requires_supervisor": getattr(e, 'requires_supervisor', False), "supervisor_count": getattr(e, 'supervisor_count', 0),
                 "requires_transport": e.requires_transport, "transport_count": getattr(e, 'transport_count', 0),
                 "requires_sampling": getattr(e, 'requires_sampling', False), "sampling_count": getattr(e, 'sampling_count', 0),
                 "location": getattr(e, 'location', None), "description": getattr(e, 'description', None), "event_type": getattr(e, 'event_type', None), "custom_times": getattr(e, 'custom_times', None),
                 "report_location": getattr(e, 'report_location', None), "report_location_image": getattr(e, 'report_location_image', None), "location_label": getattr(e, 'location_label', None), "report_photos": getattr(e, 'report_photos', None) or [],
                 **({"requires_report_approval": (e.client_name or '').strip().lower() in approval_clients,
                     "pending_approval_count": pending.get(e.id, 0)} if admin.is_admin else {})} for e in events]
    finally:
        db.close()


@app.get("/events/{slug}/sampling_status")
def get_sampling_status(slug: str):
    db = SessionLocal()
    try:
        event = db.query(Event).filter(Event.slug == slug, Event.is_active == True).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
            
        # Every field that records a sample count: the plain counter, and the BVT
        # per-pack report (whose field value is kept as the grand total of its packs).
        sampling_field_ids = [f['id'] for f in (event.fields or []) if f.get('type') in ('sampling_counter', 'bvt_sampling_report')]
        
        total_done = 0
        if sampling_field_ids:
            submissions = db.query(EventSubmission).filter(EventSubmission.event_id == event.id).all()
            for sub in submissions:
                for fid in sampling_field_ids:
                    val = (sub.data or {}).get(fid)
                    if val is not None:
                        try:
                            total_done += int(val)
                        except (ValueError, TypeError):
                            pass
                            
        return {
            "total_target": getattr(event, 'sampling_count', 0),
            "total_done": total_done
        }
    finally:
        db.close()

@app.get("/events/{slug}")
def get_event_by_slug(slug: str):
    db = SessionLocal()
    try:
        event = db.query(Event).filter(Event.slug == slug, Event.is_active == True).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        return {"id": event.id, "name": event.name, "slug": event.slug,
                "mobile_columns": event.mobile_columns, "desktop_columns": event.desktop_columns,
                "enable_voice": event.enable_voice, "enable_chat": getattr(event, 'enable_chat', False),
                "fields": event.fields, "setup_pre_fields": getattr(event, 'setup_pre_fields', []), "setup_post_fields": getattr(event, 'setup_post_fields', []),
                "client_name": event.client_name, "start_date": event.start_date, "start_time": event.start_time,
                "end_date": event.end_date, "end_time": event.end_time,
                "promoter_count": event.promoters_needed, "requires_setup": event.requires_setup, "setup_count": getattr(event, 'setup_count', 0),
                "setup_date": getattr(event, 'setup_date', None), "setup_time_in": getattr(event, 'setup_time_in', None), "setup_time_out": getattr(event, 'setup_time_out', None),
                "requires_collection": getattr(event, 'requires_collection', False), "collection_count": getattr(event, 'collection_count', 0),
                "collection_date": getattr(event, 'collection_date', None), "collection_time_in": getattr(event, 'collection_time_in', None), "collection_time_out": getattr(event, 'collection_time_out', None),
                "requires_supervisor": getattr(event, 'requires_supervisor', False), "supervisor_count": getattr(event, 'supervisor_count', 0),
                "requires_transport": event.requires_transport, "transport_count": getattr(event, 'transport_count', 0),
                "requires_sampling": getattr(event, 'requires_sampling', False), "sampling_count": getattr(event, 'sampling_count', 0),
                "location": getattr(event, 'location', None), "description": getattr(event, 'description', None), "event_type": getattr(event, 'event_type', None), "custom_times": getattr(event, 'custom_times', None),
                "report_location": getattr(event, 'report_location', None), "report_location_image": getattr(event, 'report_location_image', None), "location_label": getattr(event, 'location_label', None), "report_photos": getattr(event, 'report_photos', None) or []}
    finally:
        db.close()

class EventStatusUpdate(BaseModel):
    is_active: bool

@app.put("/admin/events/{event_id}")
def update_event(event_id: int, data: EventCreate, admin: Promoter = Depends(get_admin_user)):
    db = SessionLocal()
    try:
        event = db.query(Event).filter(Event.id == event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        if event.slug != data.slug:
            if db.query(Event).filter(Event.slug == data.slug).first():
                raise HTTPException(status_code=400, detail="slug already exists")
                
        event.name = data.name
        event.slug = data.slug
        event.fields = data.fields
        event.setup_pre_fields = data.setup_pre_fields
        event.setup_post_fields = data.setup_post_fields
        event.mobile_columns = data.mobile_columns
        event.desktop_columns = data.desktop_columns
        event.enable_voice = data.enable_voice
        event.enable_chat = data.enable_chat
        event.client_name = data.client_name
        event.start_date = data.start_date
        event.start_time = data.start_time
        event.end_date = data.end_date
        event.end_time = data.end_time
        event.promoters_needed = data.promoter_count
        event.requires_setup = data.requires_setup
        event.setup_count = data.setup_count
        event.setup_date = data.setup_date
        event.setup_time_in = data.setup_time_in
        event.setup_time_out = data.setup_time_out
        event.requires_collection = data.requires_collection
        event.collection_count = data.collection_count
        event.collection_date = data.collection_date
        event.collection_time_in = data.collection_time_in
        event.collection_time_out = data.collection_time_out
        event.requires_supervisor = data.requires_supervisor
        event.supervisor_count = data.supervisor_count
        event.requires_transport = data.requires_transport
        event.transport_count = data.transport_count
        event.requires_sampling = data.requires_sampling
        event.sampling_count = data.sampling_count
        event.location = data.location
        event.report_location = data.report_location
        event.report_location_image = data.report_location_image
        event.location_label = data.location_label
        event.description = data.description
        event.event_type = data.event_type
        event.custom_times = data.custom_times
        
        db.commit()
        db.refresh(event)
        return {"ok": True, "id": event.id, "slug": event.slug}
    finally:
        db.close()

@app.patch("/admin/events/{event_id}/report-photos")
def update_event_report_photos(event_id: int, data: ReportPhotosUpdate, admin: Promoter = Depends(get_panel_user)):
    """Pins up to 6 gallery photo URLs to show on the Mission Complete PDF."""
    db = SessionLocal()
    try:
        _ensure_event_scope(db, admin, event_id)
        event = db.query(Event).filter(Event.id == event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        if len(data.photos) > 6:
            raise HTTPException(status_code=400, detail="حداکثر ۶ عکس قابل انتخاب است")
        event.report_photos = data.photos
        db.commit()
        return {"ok": True, "report_photos": event.report_photos}
    finally:
        db.close()


class LocationSnapshotRequest(BaseModel):
    lat: float
    lng: float


@app.post("/admin/location-snapshot")
def create_location_snapshot(data: LocationSnapshotRequest, admin: Promoter = Depends(get_admin_user)):
    """Stateless utility: pins a lat/lng and returns a Maps link + a generated
    static-map image, for the Mission Completed PDF's exact-location box.
    Not tied to an event id so it also works while creating a brand-new event
    that hasn't been saved yet — EventPanel just carries the two returned
    strings along in the regular event create/update payload."""
    if not (-90 <= data.lat <= 90) or not math.isfinite(data.lng):
        raise HTTPException(status_code=400, detail="مختصات نامعتبر است")
    # Leaflet lets the map pan past ±180° — normalize so the link and tiles are valid.
    lng = ((data.lng + 180.0) % 360.0) - 180.0
    maps_url = f"https://www.google.com/maps?q={data.lat:.6f},{lng:.6f}"
    # The pinned location itself must always save — only the image is best-effort.
    # A failed snapshot (tile/geocoder outage, slow network) used to 502 the whole
    # request, so the admin couldn't record the location at all.
    image_url = ""
    try:
        image_bytes = _generate_location_snapshot(data.lat, lng)
        file_name = f"loc_{uuid.uuid4()}.jpg"
        with open(os.path.join(UPLOADS_DIR, file_name), "wb") as f:
            f.write(image_bytes)
        image_url = f"{PUBLIC_BASE_URL}/uploads/{file_name}"
    except Exception as e:
        logger.error(f"Failed to generate location snapshot: {e}", exc_info=e)
    return {"ok": True, "report_location": maps_url, "report_location_image": image_url, "image_ok": bool(image_url)}


@app.get("/admin/geocode-search")
def geocode_search(q: str, admin: Promoter = Depends(get_admin_user)):
    """Server-side proxy for the location picker's place search. Calling
    Nominatim straight from the browser failed on some devices: a custom
    User-Agent header turns it into a CORS-preflighted request that Nominatim
    rejects (Firefox/Safari), and some networks block nominatim.openstreetmap.org
    outright for the client while the server can still reach it."""
    q = (q or "").strip()
    if not q:
        return []
    try:
        resp = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": q, "format": "json", "limit": 6, "accept-language": "fa,en"},
            headers=_OSM_TILE_HEADERS, timeout=8,
        )
        resp.raise_for_status()
        return [
            {"lat": r.get("lat"), "lon": r.get("lon"), "display_name": r.get("display_name")}
            for r in resp.json() or []
        ]
    except Exception as e:
        logger.error(f"Geocode search failed: {e}")
        raise HTTPException(status_code=502, detail="جستجوی مکان با خطا مواجه شد")


@app.patch("/admin/events/{event_id}/status")
def update_event_status(event_id: int, status_data: EventStatusUpdate, admin: Promoter = Depends(get_admin_user)):
    db = SessionLocal()
    try:
        event = db.query(Event).filter(Event.id == event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        
        if status_data.is_active and not getattr(event, 'client_approved', False):
            raise HTTPException(status_code=400, detail="ابتدا باید تایید کلاینت را انجام دهید")

        event.is_active = status_data.is_active
        db.commit()
        return {"ok": True, "is_active": event.is_active}
    finally:
        db.close()

class EventArchiveUpdate(BaseModel):
    is_archived: bool

class EventApproveUpdate(BaseModel):
    client_approved: bool

@app.patch("/admin/events/{event_id}/approve")
def update_event_approve(event_id: int, data: EventApproveUpdate, admin: Promoter = Depends(get_event_manager_user)):
    db = SessionLocal()
    try:
        event = db.query(Event).filter(Event.id == event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        
        event.client_approved = data.client_approved
        if data.client_approved:
            # Auto-activate when approved
            event.is_active = True
        else:
            # Auto-deactivate when approval is revoked
            event.is_active = False
            
        db.commit()
        return {"ok": True, "client_approved": event.client_approved, "is_active": event.is_active}
    finally:
        db.close()

@app.patch("/admin/events/{event_id}/archive")
def update_event_archive(event_id: int, data: EventArchiveUpdate, admin: Promoter = Depends(get_event_manager_user)):
    db = SessionLocal()
    try:
        event = db.query(Event).filter(Event.id == event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        event.is_archived = data.is_archived
        db.commit()
        return {"ok": True, "is_archived": event.is_archived}
    finally:
        db.close()

@app.delete("/admin/events/{event_id}/submissions")
def admin_delete_submission(event_id: int, promoter_id: int, date: str, admin: Promoter = Depends(get_admin_user)):
    db = SessionLocal()
    try:
        from datetime import timezone, timedelta
        tehran_tz = timezone(timedelta(hours=3, minutes=30))
        
        submissions = db.query(EventSubmission).filter(
            EventSubmission.event_id == event_id,
            EventSubmission.promoter_id == promoter_id
        ).all()
        deleted_count = 0
        for sub in submissions:
            if sub.submitted_at:
                first_ts = getattr(sub, 'first_submitted_at', None) or sub.submitted_at
                # Convert UTC naive datetime to Tehran date string
                tehran_date = first_ts.replace(tzinfo=timezone.utc).astimezone(tehran_tz).isoformat().split('T')[0]
                if tehran_date == date:
                    db.delete(sub)
                    deleted_count += 1
        db.commit()
        return {"ok": True, "deleted_count": deleted_count}
    finally:
        db.close()

@app.get("/admin/events/{event_id}")
def admin_get_event(event_id: int, admin: Promoter = Depends(get_panel_user)):
    db = SessionLocal()
    try:
        _ensure_event_scope(db, admin, event_id)
        event = db.query(Event).filter(Event.id == event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        extra = {"requires_report_approval": (event.client_name or '').strip().lower() in _approval_clients(db)} if admin.is_admin else {}
        return {**extra, "id": event.id, "name": event.name, "slug": event.slug,
                "mobile_columns": event.mobile_columns, "desktop_columns": event.desktop_columns,
                "enable_voice": event.enable_voice, "enable_chat": getattr(event, 'enable_chat', False),
                "fields": event.fields, "setup_pre_fields": getattr(event, 'setup_pre_fields', []), "setup_post_fields": getattr(event, 'setup_post_fields', []),
                "client_name": event.client_name, "start_date": event.start_date, "start_time": event.start_time,
                "end_date": event.end_date, "end_time": event.end_time,
                "promoter_count": event.promoters_needed, "requires_setup": event.requires_setup, "setup_count": getattr(event, 'setup_count', 0),
                "requires_collection": getattr(event, 'requires_collection', False), "collection_count": getattr(event, 'collection_count', 0),
                "requires_supervisor": getattr(event, 'requires_supervisor', False), "supervisor_count": getattr(event, 'supervisor_count', 0),
                "requires_transport": event.requires_transport, "transport_count": getattr(event, 'transport_count', 0),
                "requires_sampling": getattr(event, 'requires_sampling', False), "sampling_count": getattr(event, 'sampling_count', 0),
                "location": getattr(event, 'location', None), "description": getattr(event, 'description', None), "event_type": getattr(event, 'event_type', None), "custom_times": getattr(event, 'custom_times', None),
                "report_location": getattr(event, 'report_location', None), "report_location_image": getattr(event, 'report_location_image', None), "location_label": getattr(event, 'location_label', None), "report_photos": getattr(event, 'report_photos', None) or []}
    finally:
        db.close()

@app.delete("/admin/events/{event_id}")
def delete_event(event_id: int, admin: Promoter = Depends(get_event_manager_user)):
    db = SessionLocal()
    try:
        event = db.query(Event).filter(Event.id == event_id).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        db.delete(event)
        db.commit()
        return {"ok": True}
    finally:
        db.close()

from fastapi import Body, Request
import jwt
from auth import SECRET_KEY, ALGORITHM
from sqlalchemy import cast, Date
from datetime import date, datetime

@app.get("/events/{slug}/team")
def get_event_team(slug: str, request: Request):
    db = SessionLocal()
    try:
        event = db.query(Event).filter(Event.slug == slug, Event.is_active == True).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        
        # Verify auth (optional but recommended for team directory)
        promoter_id = None
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            try:
                payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
                token_user_id = payload.get("user_id")
                username = payload.get("sub")
                user = None
                if token_user_id is not None:
                    user = db.query(Promoter).filter(Promoter.id == token_user_id).first()
                if user is None and username:
                    user = db.query(Promoter).filter(Promoter.username == username).first()
                if user:
                    promoter_id = user.id
            except Exception:
                pass

        if not promoter_id:
            raise HTTPException(status_code=401, detail="Unauthorized")

        # Get all promoters assigned to this event
        promoters = db.query(Promoter).filter(Promoter.event_id == event.id).all()
        
        result = []
        for p in promoters:
            result.append({
                "name": p.full_name or p.username,
                "role": p.role,
                "phone": p.phone_number
            })
            
        return result
    finally:
        db.close()

@app.get("/events/{slug}/my-submission-today")
def get_my_submission_today(slug: str, request: Request):
    db = SessionLocal()
    try:
        event = db.query(Event).filter(Event.slug == slug, Event.is_active == True).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        
        promoter_id = None
        promoter_user = None
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            try:
                payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
                token_user_id = payload.get("user_id")
                username = payload.get("sub")
                u = None
                if token_user_id is not None:
                    u = db.query(Promoter).filter(Promoter.id == token_user_id).first()
                if u is None and username:
                    u = db.query(Promoter).filter(Promoter.username == username).first()
                if u:
                    promoter_id = u.id
                    promoter_user = u
            except Exception:
                pass

        if not promoter_id:
            raise HTTPException(status_code=401, detail="Unauthorized")

        assert_promoter_can_access_event(promoter_user, event)

        existing = db.query(EventSubmission).filter(
            EventSubmission.event_id == event.id,
            EventSubmission.promoter_id == promoter_id
        ).order_by(EventSubmission.id.desc()).first()

        shift_start = existing.first_submitted_at or existing.submitted_at if existing else None
        if existing and shift_start and _is_same_shift(shift_start, datetime.now(timezone.utc), event):
            return {"data": existing.data, "submitted_at": existing.submitted_at.isoformat() + 'Z'}
        return {"data": None}
    finally:
        db.close()


@app.post("/events/{slug}/submit")
def submit_event(slug: str, request: Request, data: dict = Body(...)):
    db = SessionLocal()
    try:
        event = db.query(Event).filter(Event.slug == slug, Event.is_active == True).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        
        promoter_id = None
        promoter_user = None
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            try:
                payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
                token_user_id = payload.get("user_id")
                username = payload.get("sub")
                u = None
                if token_user_id is not None:
                    u = db.query(Promoter).filter(Promoter.id == token_user_id).first()
                if u is None and username:
                    u = db.query(Promoter).filter(Promoter.username == username).first()
                if u:
                    promoter_id = u.id
                    promoter_user = u
            except Exception:
                pass

        # Require authentication to submit
        if not promoter_id:
            raise HTTPException(status_code=401, detail="برای ثبت گزارش باید وارد شوید")

        assert_promoter_can_access_event(promoter_user, event)
        if promoter_user.team_name == MEHRAM_VIEWER_TEAM:
            raise HTTPException(status_code=403, detail="این حساب فقط برای مشاهده‌ی فرم گزارش‌دهی است و گزارشی ثبت نمی‌کند")

        existing = db.query(EventSubmission).filter(
            EventSubmission.event_id == event.id,
            EventSubmission.promoter_id == promoter_id
        ).order_by(EventSubmission.id.desc()).first()

        # Determine if we should update existing or create new
        existing_is_today = False
        if existing:
            shift_start = existing.first_submitted_at or existing.submitted_at
            if shift_start:
                existing_is_today = _is_same_shift(shift_start, datetime.now(timezone.utc), event)

        if existing_is_today:
            server_flags = existing.data.get('_flags', {})
            client_flags = data.get('_flags', {})
            merged_flags = client_flags.copy()
            
            for flag_key, flag_val in server_flags.items():
                if flag_key not in merged_flags:
                    data_key = flag_key
                    if '_' in flag_key:
                        parts = flag_key.split('_')
                        if len(parts) >= 2 and parts[-1].isdigit():
                            data_key = f"{'_'.join(parts[:-1])}_photo_{parts[-1]}"
                    
                    if existing.data.get(data_key) == data.get(data_key):
                        merged_flags[flag_key] = flag_val
            
            if merged_flags:
                data['_flags'] = merged_flags
            elif '_flags' in data and not merged_flags:
                del data['_flags']

            # Merge onto the existing row instead of replacing it outright. The
            # client always syncs its *entire local form snapshot* (debounced
            # 500ms after each field change), not a diff — so this only stayed
            # safe as long as that local snapshot never lagged behind what the
            # server already had. It does lag in practice: a promoter takes the
            # check-in photo, the sync is scheduled, then the tab gets
            # backgrounded/suspended before the 500ms debounce fires (iOS
            # Safari is aggressive about this) or the page gets reloaded fresh.
            # The *next* sync that does go through — for some unrelated later
            # field — carries a client snapshot missing that check-in, and
            # `existing.data = data` used to silently erase it from the row,
            # even though it had already been saved once. Merging preserves any
            # field the server has that this particular sync doesn't mention,
            # while still letting the client update or intentionally clear a
            # field it does send (e.g. removing a photo sends that field's key
            # with a smaller/empty value, which still overwrites here).
            # Reports one of our admins fixed (see edit_mehram_report) keep the server's version: the
            # promoter's phone syncs its whole old local copy and would silently undo the admin's edit
            # (and then «تایید نسخه‌ی جدید» approved the reverted report for the client).
            admin_edits = dict(existing.data.get('_admin_edits') or {})
            if admin_edits:
                for list_key, server_list in _store_report_lists(existing.data).items():
                    locked = {r.get('id'): r for r in server_list if isinstance(r, dict) and r.get('id') in admin_edits}
                    if locked and isinstance(data.get(list_key), list):
                        data[list_key] = [locked[r['id']] if isinstance(r, dict) and r.get('id') in locked else r for r in data[list_key]]
            merged_data = {**existing.data, **data}
            if admin_edits:
                merged_data['_admin_edits'] = admin_edits
            if merged_flags:
                merged_data['_flags'] = merged_flags
            else:
                merged_data.pop('_flags', None)

            existing.data = merged_data
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(existing, "data")
            existing.submitted_at = datetime.utcnow()
            # first_submitted_at never changes - preserves original day for chart grouping
        else:
            now = datetime.utcnow()
            submission = EventSubmission(
                event_id=event.id,
                promoter_id=promoter_id,
                data=data,
                submitted_at=now,
                first_submitted_at=now,
            )
            db.add(submission)
            
        db.commit()
        return {"ok": True}
    finally:
        db.close()

from models import SetupSubmission

@app.post("/events/{slug}/setup-submit")
def submit_setup_event(slug: str, request: Request, phase: str = Body(...), data: dict = Body(...)):
    db = SessionLocal()
    try:
        event = db.query(Event).filter(Event.slug == slug, Event.is_active == True).first()
        if not event:
            raise HTTPException(status_code=404, detail="Event not found")
        
        promoter_id = None
        promoter_user = None
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            try:
                payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
                token_user_id = payload.get("user_id")
                username = payload.get("sub")
                user = None
                if token_user_id is not None:
                    user = db.query(Promoter).filter(Promoter.id == token_user_id).first()
                if user is None and username:
                    user = db.query(Promoter).filter(Promoter.username == username).first()
                if user:
                    promoter_id = user.id
                    promoter_user = user
            except Exception:
                pass

        if not promoter_id:
            raise HTTPException(status_code=401, detail="برای ثبت اطلاعات باید وارد شوید")

        assert_promoter_can_access_event(promoter_user, event)

        if phase not in ["pre", "post"]:
            raise HTTPException(status_code=400, detail="Invalid phase. Must be 'pre' or 'post'.")

        submission = SetupSubmission(
            event_id=event.id,
            promoter_id=promoter_id,
            phase=phase,
            data=data
        )
        db.add(submission)
        db.commit()
        return {"ok": True}
    finally:
        db.close()

@app.get("/admin/events/{event_id}/submissions")
def get_event_submissions(event_id: int, admin: Promoter = Depends(get_panel_user)):
    db = SessionLocal()
    try:
        _ensure_event_scope(db, admin, event_id)
        subs = db.query(EventSubmission).filter(EventSubmission.event_id == event_id).order_by(EventSubmission.submitted_at.desc()).all()
        scoped = not admin.is_admin
        if scoped:
            # A client only ever sees what one of our admins approved — and nothing
            # that hints an approval step exists.
            subs = [s for s in subs if s.approved_data is not None]
        promoter_ids = {s.promoter_id for s in subs if s.promoter_id}
        promoters_by_id = {
            p.id: p for p in db.query(Promoter).filter(Promoter.id.in_(promoter_ids)).all()
        } if promoter_ids else {}
        reviews_by_sub = _load_reviews(db, [s.id for s in subs]) if not scoped else {}
        approvals_by_sub = _load_approvals(db, [s.id for s in subs]) if not scoped else {}
        result = []
        for s in subs:
            promoter_name = None
            if s.promoter_id:
                p = promoters_by_id.get(s.promoter_id)
                if p:
                    promoter_name = p.full_name or p.username
            # Fallback: try to extract name from submitted form data
            if not promoter_name and s.data:
                # Look for common name fields in the form data
                for field_key in ['full_name', 'name', 'promoter_name', 'نام']:
                    val = s.data.get(field_key)
                    if val and isinstance(val, str) and val.strip():
                        promoter_name = val.strip()
                        break
                # Try any field whose key contains 'name' or 'full'
                if not promoter_name:
                    for k, v in s.data.items():
                        if isinstance(v, str) and v.strip() and ('name' in k.lower() or 'full' in k.lower()):
                            promoter_name = v.strip()
                            break
            if not promoter_name:
                promoter_name = 'نامشخص'
            row = {
                "id": s.id,
                # Call logs are internal: a client account never gets them.
                "data": ({k: v for k, v in s.approved_data.items() if not k.endswith('_calls')} if scoped else s.data),
                "promoter_id": s.promoter_id,
                "promoter_name": promoter_name,
                "submitted_at": s.submitted_at.isoformat() + 'Z' if s.submitted_at else None,
                "first_submitted_at": (s.first_submitted_at or s.submitted_at).isoformat() + 'Z' if (s.first_submitted_at or s.submitted_at) else None,
            }
            if scoped:
                # Last change the client can see is the approved one.
                row["submitted_at"] = row["first_submitted_at"] if s.submitted_at and s.approved_at and s.submitted_at > s.approved_at else row["submitted_at"]
            else:
                row.update(_approval_fields(s, reviews_by_sub.get(s.id), approvals_by_sub.get(s.id)))
            result.append(row)
        return result
    finally:
        db.close()

def _approval_fields(s, reviews=None, approvals=None):
    approved = s.approved_data is not None
    states = _mehram_report_states(s.data, s.approved_data, reviews)
    if states:
        # Mehram: approval is per supermarket, not per submission.
        return {
            "approved_at": s.approved_at.isoformat() + 'Z' if approved and s.approved_at else None,
            "approved_by": s.approved_by if approved else None,
            "approval_stale": any(v == 'changed' for v in states.values()),
            "mehram_states": states,
            "mehram_reviews": {k: {kk: vv for kk, vv in v.items() if kk != 'at_ms'} for k, v in (reviews or {}).items() if states.get(k) == 'rejected'},
            # Who approved each report; reports approved before this was recorded fall back to the submission's last approver.
            "mehram_approvals": {k: ((approvals or {}).get(k) or {"by": s.approved_by, "at": s.approved_at.isoformat() + 'Z' if s.approved_at else None})
                                 for k, v in states.items() if v in ('approved', 'changed')},
        }
    return {
        "approved_at": s.approved_at.isoformat() + 'Z' if approved and s.approved_at else None,
        "approved_by": s.approved_by if approved else None,
        # Promoter changed the report after it was approved: the client still sees the old version.
        "approval_stale": approved and _client_view_data(s.data) != _client_view_data(s.approved_data),
    }


@app.get("/admin/mehram/visits")
def mehram_store_visits(admin: Promoter = Depends(get_panel_user)):
    """Every supermarket visit (one saved Mehram store report) across ALL events
    that have a Mehram report section — archived ones too, since each week's
    visits may live in a different event. A client account gets its client's
    events and only approved reports; our admins get everything plus an
    `approved` flag per visit."""
    db = SessionLocal()
    try:
        scope = client_scope(admin) if not admin.is_admin else None
        events = []
        for e in db.query(Event).all():
            mf = [f for f in (e.fields or []) if isinstance(f, dict) and f.get('type') == 'mehram_supermarket_report']
            if not mf or (scope and (e.client_name or '').strip().lower() != scope):
                continue
            events.append((e, mf))
        ev_ids = [e.id for e, _ in events]
        subs = db.query(EventSubmission).filter(EventSubmission.event_id.in_(ev_ids)).all() if ev_ids else []
        pids = {s.promoter_id for s in subs if s.promoter_id}
        prom_rows = db.query(Promoter).filter(Promoter.id.in_(pids)).all() if pids else []
        names = {p.id: (p.full_name or p.username) for p in prom_rows}
        person_keys = {p.id: _person_key(p) for p in prom_rows}  # matches MehramPlan / MehramDayPlan.person_key

        visits = []
        for s in subs:
            data = s.approved_data if scope else s.data
            if not data:
                continue
            # Every «<sectionId>_reports» list of store reports — not just the
            # event's current section ids: a section re-created in the builder gets
            # a new id, and the visits saved under the old one are still real visits.
            def report_lists(d):
                return {k[:-len('_reports')]: v for k, v in (d or {}).items()
                        if k.endswith('_reports') and isinstance(v, list) and any(isinstance(r, dict) and r.get('storeId') for r in v)}
            approved_reports = {r.get('id') for v in report_lists(s.approved_data).values() for r in v if isinstance(r, dict)}
            for field_id, reports in report_lists(data).items():
                calls = data.get(f"{field_id}_calls") or {}
                for r in reports:
                    if not isinstance(r, dict) or not r.get('storeId'):
                        continue
                    call = calls.get(r.get('storeId')) if isinstance(calls, dict) else None
                    v = {
                        "id": f"{s.id}:{r.get('id')}",
                        "eventId": s.event_id,
                        "fieldId": field_id,
                        # A client account never learns who the promoters are.
                        "promoterId": None if scope else s.promoter_id,
                        "promoterName": 'پروموتر' if scope else (names.get(s.promoter_id) or 'نامشخص'),
                        "personKey": None if scope else person_keys.get(s.promoter_id),
                        "storeId": str(r.get('storeId')),
                        "storeName": r.get('storeName'),
                        "city": r.get('city'),
                        "submittedAt": r.get('submittedAt'),
                        "calledAt": (call or {}).get('at') or r.get('calledAt'),
                        "callNumber": (call or {}).get('number'),
                        "storefrontSelfie": None if scope else r.get('storefrontSelfie'),  # shows the promoter
                        "posterBack": r.get('posterBack'),
                        "shelfBefore": r.get('shelfBefore'),
                        "shelfAfter": r.get('shelfAfter'),
                        "productsPhoto": r.get('productsPhoto'),
                        "productPhotos": r.get('productPhotos') if isinstance(r.get('productPhotos'), dict) else {},
                        "answers": r.get('answers') or {},
                        "notes": r.get('notes') or {},
                        "products": r.get('products') or {},
                        # Promoter's free-text problems: internal, the client account never gets it.
                        "problems": None if scope else (str(r.get('problems') or '').strip() or None),
                        "geo": r.get('geo') if isinstance(r.get('geo'), dict) else None,
                    }
                    if not scope:
                        v["approved"] = r.get('id') in approved_reports
                    visits.append(v)
        return {
            "events": [{"id": e.id, "name": e.name, "fields": mf, "startDate": e.start_date, "archived": bool(e.is_archived)} for e, mf in events],
            "visits": sorted(visits, key=lambda v: v.get('submittedAt') or 0),
        }
    finally:
        db.close()


# ── Mehram weekly visit plan ──
MEHRAM_CLIENT = "mahram"
MEHRAM_VIEWER_TEAM = "mahram-viewer"  # promoter-style login of the client: sees the report form (no selfie step), never submits
_TEHRAN_OFFSET_MS = 210 * 60 * 1000


def _tehran_week_start(ms: int) -> int:
    """Epoch ms of the Saturday 00:00 (Tehran) starting the week of `ms` — same as weekStart() in mehramVisits.js."""
    d = datetime.utcfromtimestamp((ms + _TEHRAN_OFFSET_MS) / 1000)
    back = (d.weekday() + 2) % 7  # Sat → 0, Sun → 1, … Fri → 6
    start = datetime(d.year, d.month, d.day) - timedelta(days=back)
    return int((start - datetime(1970, 1, 1)).total_seconds() * 1000) - _TEHRAN_OFFSET_MS


def _person_key(p):
    return f"r:{p.roster_id}" if p.roster_id else f"p:{p.id}"


def _ensure_mehram_access(admin):
    if not admin.is_admin and client_scope(admin) != MEHRAM_CLIENT:
        raise HTTPException(status_code=403, detail="Admin access required")


@app.get("/admin/mehram/people")
def mehram_people(admin: Promoter = Depends(get_admin_user)):
    """Everyone who has a promoter row on a Mehram event — who a plan can be assigned to.
    `eventIds` lists the Mehram events the person is on, so the plan bar can put the
    chosen event's own promoters first; `active` = on at least one non-archived event."""
    db = SessionLocal()
    try:
        events = [e for e in db.query(Event).all() if (e.client_name or '').strip().lower() == MEHRAM_CLIENT]
        archived = {e.id: bool(e.is_archived) for e in events}
        rows = db.query(Promoter).filter(Promoter.event_id.in_(list(archived))).all() if archived else []
        rosters = {r.id: r for r in db.query(PromoterRoster).filter(PromoterRoster.id.in_({p.roster_id for p in rows if p.roster_id})).all()}
        people = {}
        for p in rows:
            if p.is_admin or p.admin_client or p.team_name == MEHRAM_VIEWER_TEAM:
                continue
            key = _person_key(p)
            r = rosters.get(p.roster_id)
            person = people.setdefault(key, {"key": key, "name": (r.full_name if r else None) or p.full_name or p.username,
                                             "phone": (r.phone_number if r else None) or p.phone_number,
                                             "eventIds": [], "active": False})
            person["eventIds"].append(p.event_id)
            person["active"] = person["active"] or not archived.get(p.event_id, True)
        return sorted(people.values(), key=lambda x: x["name"] or "")
    finally:
        db.close()


@app.get("/admin/mehram/plans")
def mehram_plans(week: int, admin: Promoter = Depends(get_panel_user)):
    _ensure_mehram_access(admin)
    if not admin.is_admin:
        return []  # the work schedule is internal
    db = SessionLocal()
    try:
        rows = db.query(MehramPlan).filter(MehramPlan.client == MEHRAM_CLIENT, MehramPlan.week_start == _tehran_week_start(week)).order_by(MehramPlan.position, MehramPlan.id).all()
        return [{"storeId": r.store_id, "personKey": r.person_key, "personName": r.person_name, "position": r.position} for r in rows]
    finally:
        db.close()


class MehramPlanUpdate(BaseModel):
    week: int
    store_ids: List[str]
    person_key: Optional[str] = None  # None = remove these stores from the week's plan
    person_name: Optional[str] = None


@app.put("/admin/mehram/plans")
def set_mehram_plans(data: MehramPlanUpdate, admin: Promoter = Depends(get_admin_user)):
    db = SessionLocal()
    try:
        week = _tehran_week_start(data.week)
        ids = list(dict.fromkeys(str(s) for s in data.store_ids))
        db.query(MehramPlan).filter(MehramPlan.client == MEHRAM_CLIENT, MehramPlan.week_start == week,
                                    MehramPlan.store_id.in_(ids)).delete(synchronize_session=False)
        if data.person_key:
            # New stores go to the end of that person's route.
            rows = db.query(MehramPlan).filter(MehramPlan.client == MEHRAM_CLIENT, MehramPlan.week_start == week,
                                               MehramPlan.person_key == data.person_key).all()
            pos = max([r.position or 0 for r in rows] + [len(rows)])
            for sid in ids:
                pos += 1
                db.add(MehramPlan(client=MEHRAM_CLIENT, week_start=week, store_id=sid, person_key=data.person_key,
                                  person_name=data.person_name, position=pos, created_by=admin.username))
        db.commit()
        return {"ok": True, "week": week, "count": len(ids)}

    finally:
        db.close()


class MehramPlanOrder(BaseModel):
    week: int
    person_key: str
    store_ids: List[str]  # the person's stores in the new visiting order


@app.put("/admin/mehram/plans/order")
def set_mehram_plan_order(data: MehramPlanOrder, admin: Promoter = Depends(get_admin_user)):
    """Reorder one promoter's weekly route. Only that person's already-planned stores are touched;
    stores of theirs missing from the list keep their relative order after the listed ones."""
    if len(data.store_ids) > 2000:
        raise HTTPException(status_code=400, detail="Too many stores")
    db = SessionLocal()
    try:
        week = _tehran_week_start(data.week)
        rows = db.query(MehramPlan).filter(MehramPlan.client == MEHRAM_CLIENT, MehramPlan.week_start == week,
                                           MehramPlan.person_key == data.person_key).order_by(MehramPlan.position, MehramPlan.id).all()
        by_id = {r.store_id: r for r in rows}
        order = [by_id[s] for s in dict.fromkeys(str(x) for x in data.store_ids) if s in by_id]
        order += [r for r in rows if r not in order]
        for i, r in enumerate(order, 1):
            r.position = i
        db.commit()
        return {"ok": True, "count": len(order)}
    finally:
        db.close()


# Deleting a supermarket report for good (data and all) is limited to this admin account.
REPORT_DELETER_USERNAMES = {"kave"}


def can_delete_reports(user) -> bool:
    return bool(getattr(user, "is_admin", False)) and (user.username or "").strip().lower() in REPORT_DELETER_USERNAMES


class MehramReportReset(BaseModel):
    submission_ids: List[int]
    report_ids: List[str]


@app.post("/admin/events/{event_id}/mehram-reports/reset-review")
def reset_mehram_report_review(event_id: int, data: MehramReportReset, admin: Promoter = Depends(get_admin_user)):
    """Takes back a «عدم تایید»: the report goes back to «در انتظار تایید» (not shown to the client, not rejected)."""
    if not can_approve_reports(admin):
        raise HTTPException(status_code=403, detail="شما اجازه تایید گزارش را ندارید")
    if len(data.report_ids) > 2000:
        raise HTTPException(status_code=400, detail="Too many reports")
    db = SessionLocal()
    try:
        ids = {str(i) for i in data.report_ids}
        subs = db.query(EventSubmission).filter(EventSubmission.event_id == event_id, EventSubmission.id.in_(data.submission_ids)).all()
        for s in subs:
            db.query(MehramReportReview).filter(MehramReportReview.submission_id == s.id,
                                                MehramReportReview.report_id.in_(ids)).delete(synchronize_session=False)
        db.commit()
        reviews = _load_reviews(db, [s.id for s in subs])
        approvals = _load_approvals(db, [s.id for s in subs])
        return [{"id": s.id, **_approval_fields(s, reviews.get(s.id), approvals.get(s.id))} for s in subs]
    finally:
        db.close()


class MehramReportDelete(BaseModel):
    submission_ids: List[int]  # the card's submissions; the report is looked up in them
    report_id: str


@app.post("/admin/events/{event_id}/mehram-reports/delete")
def delete_mehram_report(event_id: int, data: MehramReportDelete, admin: Promoter = Depends(get_admin_user)):
    """Removes one supermarket report completely: from the submission, from the client's approved copy, its approval /
    «عدم تایید» records. The store is then simply «not visited» that week everywhere (map, counts, exports) and — its
    weekly plan row is untouched — it shows up again as planned, ready for a new visit. Uploaded photo files stay on disk."""
    if not can_delete_reports(admin):
        raise HTTPException(status_code=403, detail="شما اجازه حذف گزارش را ندارید")
    rid = str(data.report_id)
    db = SessionLocal()
    try:
        import copy
        from sqlalchemy.orm.attributes import flag_modified
        subs = db.query(EventSubmission).filter(EventSubmission.event_id == event_id, EventSubmission.id.in_(data.submission_ids)).all()
        hit = None
        for s in subs:
            d = copy.deepcopy(s.data or {})
            removed = False
            for key, lst in _store_report_lists(d).items():
                keep = [x for x in lst if not (isinstance(x, dict) and str(x.get('id')) == rid)]
                if len(keep) != len(lst):
                    d[key] = keep
                    removed = True
            if not removed:
                continue
            hit = s
            if isinstance(d.get('_admin_edits'), dict):
                d['_admin_edits'].pop(rid, None)
            s.data = d
            flag_modified(s, "data")
            if s.approved_data:
                ap = copy.deepcopy(s.approved_data)
                for key, lst in _store_report_lists(ap).items():
                    ap[key] = [x for x in lst if not (isinstance(x, dict) and str(x.get('id')) == rid)]
                others = [k for k in ap if not (k.endswith('_reports') or k.endswith('_calls') or k == '_flags')]
                if not _store_report_lists(ap) and not others:
                    s.approved_data, s.approved_at, s.approved_by = None, None, None
                else:
                    s.approved_data = ap
                flag_modified(s, "approved_data")
            db.query(MehramReportApprover).filter(MehramReportApprover.submission_id == s.id, MehramReportApprover.report_id == rid).delete(synchronize_session=False)
            db.query(MehramReportReview).filter(MehramReportReview.submission_id == s.id, MehramReportReview.report_id == rid).delete(synchronize_session=False)
            break
        if hit is None:
            raise HTTPException(status_code=404, detail="گزارش سوپرمارکت پیدا نشد")
        db.commit()
        _visit_counts_cache["data"] = None
        logger.info(f"Mehram report {rid} (submission {hit.id}, event {event_id}) deleted by {admin.username}")
        reviews = _load_reviews(db, [hit.id])
        approvals = _load_approvals(db, [hit.id])
        return [{"id": hit.id, "data": hit.data, **_approval_fields(hit, reviews.get(hit.id), approvals.get(hit.id))}]
    finally:
        db.close()


_visit_counts_cache = {"at": 0.0, "data": None}


@app.get("/mehram/visit-counts")
def mehram_visit_counts(user: Promoter = Depends(get_current_user)):
    """{counts: {storeId: number of weeks the store has been visited}, thisWeek: [storeIds reported this week]} across every
    Mehram event and every promoter — the form shows each supermarket's «ویزیت چندم» from it. A visit is one store in one
    week (a second report in the same week is the same visit). Only counts, nothing about who visited. Cached a few seconds."""
    now = time.time()
    cached = _visit_counts_cache["data"]
    if cached is not None and now - _visit_counts_cache["at"] < 15:
        return cached
    db = SessionLocal()
    try:
        ev_ids = [e.id for e in db.query(Event).all()
                  if any(isinstance(f, dict) and f.get('type') == 'mehram_supermarket_report' for f in (e.fields or []))]
        weeks: dict = {}
        if ev_ids:
            for (data,) in db.query(EventSubmission.data).filter(EventSubmission.event_id.in_(ev_ids)).all():
                for k, v in (data or {}).items():
                    if k.endswith('_reports') and isinstance(v, list):
                        for r in v:
                            if isinstance(r, dict) and r.get('storeId') and r.get('submittedAt'):
                                weeks.setdefault(str(r['storeId']), set()).add(_tehran_week_start(int(r['submittedAt'])))
        this_week = _tehran_week_start(int(now * 1000))
        out = {"counts": {sid: len(w) for sid, w in weeks.items()}, "thisWeek": [sid for sid, w in weeks.items() if this_week in w]}
        _visit_counts_cache["at"] = now
        _visit_counts_cache["data"] = out
        return out
    finally:
        db.close()


def _mehram_promoter_only(user):
    """The promoter-side Mehram endpoints are for real promoters: not admins, client accounts or the client's view-only login."""
    if user.is_admin or user.admin_client or user.team_name == MEHRAM_VIEWER_TEAM:
        raise HTTPException(status_code=403, detail="این بخش فقط برای پروموترهاست")


class MyPlanOrder(BaseModel):
    scope: str = "week"  # 'week' = this week's route, 'day' = today's route
    store_ids: List[str]  # the promoter's stores in the new visiting order


@app.put("/mehram/my-plan/order")
def set_my_mehram_plan_order(data: MyPlanOrder, user: Promoter = Depends(get_current_user)):
    """A promoter reorders their OWN route (this week's, or today's when the admins made a daily plan). Only the order
    changes: stores can't be added or removed here, and stores missing from the list keep their relative order after the listed ones."""
    _mehram_promoter_only(user)
    if len(data.store_ids) > 2000 or data.scope not in ("week", "day"):
        raise HTTPException(status_code=400, detail="Invalid order")
    db = SessionLocal()
    try:
        key = _person_key(user)
        now_ms = int(time.time() * 1000)
        if data.scope == "day":
            rows = db.query(MehramDayPlan).filter(MehramDayPlan.client == MEHRAM_CLIENT, MehramDayPlan.day == _tehran_day_start(now_ms),
                                                  MehramDayPlan.person_key == key).order_by(MehramDayPlan.position, MehramDayPlan.id).all()
        else:
            rows = db.query(MehramPlan).filter(MehramPlan.client == MEHRAM_CLIENT, MehramPlan.week_start == _tehran_week_start(now_ms),
                                               MehramPlan.person_key == key).order_by(MehramPlan.position, MehramPlan.id).all()
        by_id = {r.store_id: r for r in rows}
        order = [by_id[s] for s in dict.fromkeys(str(x) for x in data.store_ids) if s in by_id]
        order += [r for r in rows if r not in order]
        for i, r in enumerate(order, 1):
            r.position = i
        db.commit()
        return {"ok": True, "storeIds": [r.store_id for r in order]}
    finally:
        db.close()


# ── Store notes: admins → promoters ──
class StoreNoteIn(BaseModel):
    store_id: Optional[str] = None
    text: str


class StoreNoteResponse(BaseModel):
    status: str  # accepted | declined
    reason: Optional[str] = None


def _note_out(n):
    return {"id": n.id, "storeId": n.store_id, "text": n.text, "by": n.created_by,
            "at": n.created_at.isoformat() + 'Z' if n.created_at else None,
            "status": n.status or 'pending', "reason": n.response_reason or '', "respondedBy": n.responded_by,
            "respondedAt": n.responded_at.isoformat() + 'Z' if n.responded_at else None}


def _clean_note_text(text):
    t = (text or '').strip()
    if not t:
        raise HTTPException(status_code=400, detail="متن نوت را بنویسید")
    if len(t) > 1000:
        raise HTTPException(status_code=400, detail="نوت بیش از حد طولانی است")
    return t


@app.get("/admin/mehram/notes")
def mehram_notes_admin(admin: Promoter = Depends(get_panel_user)):
    _ensure_mehram_access(admin)
    if not admin.is_admin:
        return []  # internal: the client account never sees what we tell the promoters
    db = SessionLocal()
    try:
        return [_note_out(n) for n in db.query(MehramStoreNote).filter(MehramStoreNote.client == MEHRAM_CLIENT).order_by(MehramStoreNote.id).all()]
    finally:
        db.close()


@app.post("/admin/mehram/notes")
def add_mehram_note(data: StoreNoteIn, admin: Promoter = Depends(get_admin_user)):
    store_id = str(data.store_id or '').strip()
    if not store_id or len(store_id) > 40:
        raise HTTPException(status_code=400, detail="فروشگاه نامعتبر است")
    text = _clean_note_text(data.text)
    db = SessionLocal()
    try:
        n = MehramStoreNote(client=MEHRAM_CLIENT, store_id=store_id, text=text, created_by=admin.full_name or admin.username)
        db.add(n)
        db.commit()
        db.refresh(n)
        return _note_out(n)
    finally:
        db.close()


@app.put("/admin/mehram/notes/{note_id}")
def edit_mehram_note(note_id: int, data: StoreNoteIn, admin: Promoter = Depends(get_admin_user)):
    """Changing the text asks the promoter again: the answer is cleared and the note is pending."""
    text = _clean_note_text(data.text)
    db = SessionLocal()
    try:
        n = db.query(MehramStoreNote).filter(MehramStoreNote.id == note_id, MehramStoreNote.client == MEHRAM_CLIENT).first()
        if not n:
            raise HTTPException(status_code=404, detail="نوت پیدا نشد")
        n.text = text
        n.status, n.response_reason, n.responded_by, n.responded_at = 'pending', None, None, None
        db.commit()
        db.refresh(n)
        return _note_out(n)
    finally:
        db.close()


@app.delete("/admin/mehram/notes/{note_id}")
def delete_mehram_note(note_id: int, admin: Promoter = Depends(get_admin_user)):
    db = SessionLocal()
    try:
        n = db.query(MehramStoreNote).filter(MehramStoreNote.id == note_id, MehramStoreNote.client == MEHRAM_CLIENT).first()
        if not n:
            raise HTTPException(status_code=404, detail="نوت پیدا نشد")
        db.delete(n)
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.get("/mehram/store-notes")
def mehram_notes_for_promoter(user: Promoter = Depends(get_current_user)):
    """Every note the admins left, for the promoter's report form (shown under the questions of that store)."""
    if user.is_admin or user.admin_client or user.team_name == MEHRAM_VIEWER_TEAM:
        return []
    db = SessionLocal()
    try:
        return [_note_out(n) for n in db.query(MehramStoreNote).filter(MehramStoreNote.client == MEHRAM_CLIENT).order_by(MehramStoreNote.id).all()]
    finally:
        db.close()


@app.post("/mehram/store-notes/{note_id}/respond")
def respond_mehram_note(note_id: int, data: StoreNoteResponse, user: Promoter = Depends(get_current_user)):
    """The promoter answers a note: تایید, or عدم تایید with a reason (required). Answering again simply replaces the answer."""
    _mehram_promoter_only(user)
    status_v = (data.status or '').strip()
    if status_v not in ('accepted', 'declined'):
        raise HTTPException(status_code=400, detail="پاسخ نامعتبر است")
    reason = (data.reason or '').strip()
    if status_v == 'declined' and not reason:
        raise HTTPException(status_code=400, detail="دلیل عدم تایید را بنویسید")
    if len(reason) > 500:
        raise HTTPException(status_code=400, detail="دلیل بیش از حد طولانی است")
    db = SessionLocal()
    try:
        n = db.query(MehramStoreNote).filter(MehramStoreNote.id == note_id, MehramStoreNote.client == MEHRAM_CLIENT).first()
        if not n:
            raise HTTPException(status_code=404, detail="نوت پیدا نشد")
        n.status = status_v
        n.response_reason = reason if status_v == 'declined' else None
        n.responded_by = user.full_name or user.username
        n.responded_at = datetime.utcnow()
        db.commit()
        db.refresh(n)
        return _note_out(n)
    finally:
        db.close()


@app.get("/mehram/my-plan")
def my_mehram_plan(user: Promoter = Depends(get_current_user)):
    """The logged-in promoter's stores for the current week."""
    db = SessionLocal()
    try:
        week = _tehran_week_start(int(time.time() * 1000))
        key = _person_key(user)
        rows = db.query(MehramPlan).filter(MehramPlan.client == MEHRAM_CLIENT, MehramPlan.week_start == week,
                                           MehramPlan.person_key == key).order_by(MehramPlan.position, MehramPlan.id).all()  # order = the route the admins set (else the order they added them)
        # Planned stores this person already reported this week — on any day / event.
        my_ids = [p.id for p in db.query(Promoter).filter(Promoter.roster_id == user.roster_id).all()] if user.roster_id else [user.id]
        done = set()
        for sub in db.query(EventSubmission).filter(EventSubmission.promoter_id.in_(my_ids)).all():
            for k, v in (sub.data or {}).items():
                if k.endswith('_reports') and isinstance(v, list):
                    done.update(str(r.get('storeId')) for r in v
                                if isinstance(r, dict) and r.get('storeId') and (r.get('submittedAt') or 0) >= week)
        planned = [r.store_id for r in rows]
        # Today's daily plan (if the admins made one for multi-day events), in visiting order.
        today = _tehran_day_start(int(time.time() * 1000))
        day_rows = (db.query(MehramDayPlan).filter(MehramDayPlan.client == MEHRAM_CLIENT, MehramDayPlan.day == today,
                                                   MehramDayPlan.person_key == key)
                    .order_by(MehramDayPlan.position, MehramDayPlan.id).all())
        day_planned = [r.store_id for r in day_rows]
        day_done = set()
        for sub in db.query(EventSubmission).filter(EventSubmission.promoter_id.in_(my_ids)).all():
            for k, v in (sub.data or {}).items():
                if k.endswith('_reports') and isinstance(v, list):
                    day_done.update(str(r.get('storeId')) for r in v
                                    if isinstance(r, dict) and r.get('storeId') and (r.get('submittedAt') or 0) >= today)
        return {"week": week, "storeIds": planned, "doneStoreIds": [sid for sid in planned if sid in done],
                "day": today, "dayStoreIds": day_planned, "dayDoneStoreIds": [sid for sid in day_planned if sid in day_done]}
    finally:
        db.close()


def _tehran_day_start(ms: int) -> int:
    """Epoch ms of 00:00 Tehran of the day containing `ms`."""
    d = datetime.utcfromtimestamp((ms + _TEHRAN_OFFSET_MS) / 1000)
    return int((datetime(d.year, d.month, d.day) - datetime(1970, 1, 1)).total_seconds() * 1000) - _TEHRAN_OFFSET_MS


@app.get("/admin/mehram/day-plans")
def mehram_day_plans(start: int, end: int, admin: Promoter = Depends(get_panel_user)):
    """Daily plan rows for the days in [start, end] (epoch ms)."""
    _ensure_mehram_access(admin)
    if not admin.is_admin:
        return []  # the work schedule is internal
    db = SessionLocal()
    try:
        rows = (db.query(MehramDayPlan)
                .filter(MehramDayPlan.client == MEHRAM_CLIENT, MehramDayPlan.day >= _tehran_day_start(start), MehramDayPlan.day <= _tehran_day_start(end))
                .order_by(MehramDayPlan.day, MehramDayPlan.position, MehramDayPlan.id).all())
        return [{"day": r.day, "storeId": r.store_id, "personKey": r.person_key, "personName": r.person_name, "position": r.position} for r in rows]
    finally:
        db.close()


class MehramDayPlanUpdate(BaseModel):
    days: List[int]  # any epoch ms inside each target day; the same stores are applied to every day listed
    store_ids: List[str]
    person_key: Optional[str] = None  # None = remove these stores from those days
    person_name: Optional[str] = None


@app.put("/admin/mehram/day-plans")
def set_mehram_day_plans(data: MehramDayPlanUpdate, admin: Promoter = Depends(get_admin_user)):
    if len(data.days) > 62 or len(data.store_ids) > 2000:
        raise HTTPException(status_code=400, detail="Too many days or stores")
    db = SessionLocal()
    try:
        days = list(dict.fromkeys(_tehran_day_start(d) for d in data.days))
        ids = list(dict.fromkeys(str(s) for s in data.store_ids))
        for day in days:
            db.query(MehramDayPlan).filter(MehramDayPlan.client == MEHRAM_CLIENT, MehramDayPlan.day == day,
                                           MehramDayPlan.store_id.in_(ids)).delete(synchronize_session=False)
            if not data.person_key:
                continue
            last = (db.query(MehramDayPlan.position).filter(MehramDayPlan.client == MEHRAM_CLIENT, MehramDayPlan.day == day,
                                                            MehramDayPlan.person_key == data.person_key)
                    .order_by(MehramDayPlan.position.desc()).first())
            pos = (last[0] if last and last[0] is not None else 0)
            for sid in ids:
                pos += 1
                db.add(MehramDayPlan(client=MEHRAM_CLIENT, day=day, store_id=sid, person_key=data.person_key,
                                     person_name=data.person_name, position=pos, created_by=admin.username))
        db.commit()
        return {"ok": True, "days": days, "count": len(ids)}
    finally:
        db.close()


class MehramReportApproval(BaseModel):
    submission_ids: List[int]
    report_ids: List[str]
    approve: bool = True


@app.post("/admin/events/{event_id}/mehram-reports/approval")
def set_mehram_reports_approval(event_id: int, data: MehramReportApproval, admin: Promoter = Depends(get_admin_user)):
    """Approve (snapshot) or withdraw individual supermarket reports for the client account.
    The client only ever receives the approved supermarket reports, not the rest of the submission."""
    if not can_approve_reports(admin):
        raise HTTPException(status_code=403, detail="شما اجازه تایید گزارش را ندارید")
    if len(data.report_ids) > 2000:
        raise HTTPException(status_code=400, detail="Too many reports")
    db = SessionLocal()
    try:
        import copy
        ids = {str(i) for i in data.report_ids}
        subs = db.query(EventSubmission).filter(EventSubmission.event_id == event_id, EventSubmission.id.in_(data.submission_ids)).all()
        now = datetime.utcnow()
        for s in subs:
            # Reports approved before per-report attribution existed carry the submission's last approver;
            # pin that down now, before this approval overwrites approved_by.
            have = {r for (r,) in db.query(MehramReportApprover.report_id).filter(MehramReportApprover.submission_id == s.id).all()}
            for lst in _store_report_lists(s.approved_data).values():
                for x in lst:
                    if isinstance(x, dict) and x.get('id') is not None and str(x['id']) not in have and s.approved_by:
                        db.add(MehramReportApprover(submission_id=s.id, report_id=str(x['id']), approved_by=s.approved_by, approved_at=s.approved_at or datetime.utcnow()))
            db.flush()
            ap = copy.deepcopy(s.approved_data) if s.approved_data else {}
            changed = False
            for key, reports in _store_report_lists(s.data).items():
                calls_key = f"{key[:-len('_reports')]}_calls"
                src_calls = (s.data or {}).get(calls_key) or {}
                for r in reports:
                    if not isinstance(r, dict) or str(r.get('id')) not in ids:
                        continue
                    kept = [x for x in ap.get(key, []) if isinstance(x, dict) and x.get('id') != r.get('id')]
                    if data.approve:
                        kept.append(copy.deepcopy(r))
                        if isinstance(src_calls, dict) and src_calls.get(r.get('storeId')):
                            ap.setdefault(calls_key, {})[r.get('storeId')] = copy.deepcopy(src_calls[r.get('storeId')])
                    elif not any(x.get('storeId') == r.get('storeId') for x in kept) and isinstance(ap.get(calls_key), dict):
                        ap[calls_key].pop(r.get('storeId'), None)
                    ap[key] = kept
                    changed = True
            if not changed:
                continue
            others = [k for k in ap if not (k.endswith('_reports') or k.endswith('_calls') or k == '_flags')]
            if not _store_report_lists(ap) and not others:
                s.approved_data, s.approved_at, s.approved_by = None, None, None
            else:
                s.approved_data, s.approved_at, s.approved_by = ap, now, admin.username
            mine = [str(r.get('id')) for lst in _store_report_lists(s.data).values() for r in lst
                    if isinstance(r, dict) and str(r.get('id')) in ids]
            db.query(MehramReportApprover).filter(MehramReportApprover.submission_id == s.id,
                                                  MehramReportApprover.report_id.in_(mine)).delete(synchronize_session=False)
            if data.approve:
                for rid in mine:
                    db.add(MehramReportApprover(submission_id=s.id, report_id=rid, approved_by=admin.username, approved_at=now))
            if data.approve:  # approving settles an earlier «عدم تایید»
                db.query(MehramReportReview).filter(MehramReportReview.submission_id == s.id,
                                                    MehramReportReview.report_id.in_(ids)).delete(synchronize_session=False)
        db.commit()
        reviews = _load_reviews(db, [s.id for s in subs])
        approvals = _load_approvals(db, [s.id for s in subs])
        return [{"id": s.id, **_approval_fields(s, reviews.get(s.id), approvals.get(s.id))} for s in subs]
    finally:
        db.close()


class MehramReportEdit(BaseModel):
    submission_ids: List[int]  # the card's submissions; the report is looked up in them
    report_id: str
    # Only the keys present are touched. Photo values: a /uploads/ URL replaces, '' removes.
    photos: Optional[Dict[str, str]] = None          # storefrontSelfie / posterBack / shelfBefore / shelfAfter / productsPhoto
    productPhotos: Optional[Dict[str, str]] = None   # product group key -> URL or ''
    answers: Optional[Dict[str, str]] = None         # shelf question key -> option
    notes: Optional[Dict[str, str]] = None
    products: Optional[Dict[str, str]] = None        # product group key -> status
    problems: Optional[str] = None                   # «توضیحات فروشگاه» (free text the promoter wrote)


_MEHRAM_PHOTO_KEYS = {'storefrontSelfie', 'posterBack', 'shelfBefore', 'shelfAfter', 'productsPhoto'}
_MEHRAM_STATUSES = {'موجود', 'ناکافی', 'موجود نیست'}


@app.post("/admin/events/{event_id}/mehram-reports/edit")
def edit_mehram_report(event_id: int, data: MehramReportEdit, admin: Promoter = Depends(get_admin_user)):
    """Our admins fix one supermarket report: remove/replace photos, change shelf answers or product statuses.
    If an approver edits an already approved report it stays approved (with the fix); otherwise it becomes «changed» and needs approving again."""
    uploads_prefix = f"{PUBLIC_BASE_URL}/uploads/"
    def clean_url(u):
        u = (u or '').strip()
        if u and not (u.startswith(uploads_prefix) and len(u) < 600):
            raise HTTPException(status_code=400, detail="آدرس عکس معتبر نیست")
        return u
    if any(k not in _MEHRAM_PHOTO_KEYS for k in (data.photos or {})):
        raise HTTPException(status_code=400, detail="Unknown photo")
    for st in (data.products or {}).values():
        if st not in _MEHRAM_STATUSES:
            raise HTTPException(status_code=400, detail="وضعیت محصول معتبر نیست")
    db = SessionLocal()
    try:
        import copy
        from sqlalchemy.orm.attributes import flag_modified
        subs = db.query(EventSubmission).filter(EventSubmission.id.in_(data.submission_ids), EventSubmission.event_id == event_id).all()
        s, new_data, target = None, None, None
        for cand in subs:
            d = copy.deepcopy(cand.data or {})
            for lst in _store_report_lists(d).values():
                for r in lst:
                    if isinstance(r, dict) and str(r.get('id')) == data.report_id:
                        s, new_data, target = cand, d, r
        if target is None:
            raise HTTPException(status_code=404, detail="گزارش سوپرمارکت پیدا نشد")
        before = copy.deepcopy(target)
        old_pp = dict(target.get('productPhotos') or {})
        for k, u in (data.photos or {}).items():
            target[k] = clean_url(u)
        if data.productPhotos is not None:
            pp = dict(target.get('productPhotos') or {})
            for k, u in data.productPhotos.items():
                u = clean_url(u)
                if u:
                    pp[k] = u
                else:
                    pp.pop(k, None)
            target['productPhotos'] = pp
            if not (data.photos and 'productsPhoto' in data.photos):
                # The summary photo follows the group photos (it is the first of them).
                cur = target.get('productsPhoto') or ''
                if not cur or cur in old_pp.values():
                    target['productsPhoto'] = next((v for v in pp.values() if v), '')
        for field_name in ('answers', 'notes', 'products'):
            patch = getattr(data, field_name)
            if patch is None:
                continue
            cur = dict(target.get(field_name) or {})
            for k, v in patch.items():
                v = (v or '').strip()
                if len(k) > 80 or len(v) > 1000:
                    raise HTTPException(status_code=400, detail="Too long")
                if v:
                    cur[k] = v
                elif field_name == 'notes':
                    cur.pop(k, None)
                else:
                    cur[k] = v
            target[field_name] = cur
        if data.problems is not None:
            note = (data.problems or '').strip()
            if len(note) > 1000:
                raise HTTPException(status_code=400, detail="Too long")
            target['problems'] = note
        if target != before:
            new_data['_admin_edits'] = {**(new_data.get('_admin_edits') or {}), str(target.get('id')): datetime.utcnow().isoformat() + 'Z'}
        s.data = new_data
        flag_modified(s, "data")
        # An approver fixing a report the client already sees keeps it approved: the client gets the corrected
        # version straight away. Edits by other admins (or to unapproved reports) still need an approval.
        if can_approve_reports(admin) and s.approved_data and target != before:
            ap = copy.deepcopy(s.approved_data)
            for key, lst in _store_report_lists(ap).items():
                if any(isinstance(x, dict) and x.get('id') == target.get('id') and x == before for x in lst):
                    ap[key] = [copy.deepcopy(target) if (isinstance(x, dict) and x.get('id') == target.get('id')) else x for x in lst]
                    now = datetime.utcnow()
                    s.approved_data, s.approved_at, s.approved_by = ap, now, admin.username
                    flag_modified(s, "approved_data")
                    db.query(MehramReportApprover).filter(MehramReportApprover.submission_id == s.id,
                                                          MehramReportApprover.report_id == str(target.get('id'))).delete(synchronize_session=False)
                    db.add(MehramReportApprover(submission_id=s.id, report_id=str(target.get('id')), approved_by=admin.username, approved_at=now))
                    break
        db.commit()
        reviews = _load_reviews(db, [s.id])
        approvals = _load_approvals(db, [s.id])
        return [{"id": s.id, "data": s.data, **_approval_fields(s, reviews.get(s.id), approvals.get(s.id))}]
    finally:
        db.close()


class MehramReportReject(BaseModel):
    submission_ids: List[int]
    report_ids: List[str]
    reason: str


@app.post("/admin/events/{event_id}/mehram-reports/reject")
def reject_mehram_reports(event_id: int, data: MehramReportReject, admin: Promoter = Depends(get_admin_user)):
    """«عدم تایید»: hide supermarket reports from the client and record why, for the other admins."""
    if not can_approve_reports(admin):
        raise HTTPException(status_code=403, detail="شما اجازه تایید گزارش را ندارید")
    reason = (data.reason or '').strip()
    if not reason:
        raise HTTPException(status_code=400, detail="دلیل عدم تایید را بنویسید")
    if len(reason) > 1000 or len(data.report_ids) > 2000:
        raise HTTPException(status_code=400, detail="Too long")
    db = SessionLocal()
    try:
        import copy
        ids = {str(i) for i in data.report_ids}
        subs = db.query(EventSubmission).filter(EventSubmission.event_id == event_id, EventSubmission.id.in_(data.submission_ids)).all()
        now = datetime.utcnow()
        for s in subs:
            mine = [str(r.get('id')) for lst in _store_report_lists(s.data).values() for r in lst
                    if isinstance(r, dict) and str(r.get('id')) in ids]
            if not mine:
                continue
            # The client must stop seeing it: pull it out of the approved snapshot.
            if s.approved_data:
                ap = copy.deepcopy(s.approved_data)
                for key, lst in _store_report_lists(ap).items():
                    removed = [x for x in lst if isinstance(x, dict) and str(x.get('id')) in mine]
                    ap[key] = [x for x in lst if not (isinstance(x, dict) and str(x.get('id')) in mine)]
                    calls_key = f"{key[:-len('_reports')]}_calls"
                    for x in removed:
                        if isinstance(ap.get(calls_key), dict) and not any(y.get('storeId') == x.get('storeId') for y in ap[key]):
                            ap[calls_key].pop(x.get('storeId'), None)
                others = [k for k in ap if not (k.endswith('_reports') or k.endswith('_calls') or k == '_flags')]
                if not _store_report_lists(ap) and not others:
                    s.approved_data, s.approved_at, s.approved_by = None, None, None
                else:
                    s.approved_data = ap
            db.query(MehramReportApprover).filter(MehramReportApprover.submission_id == s.id,
                                                  MehramReportApprover.report_id.in_(mine)).delete(synchronize_session=False)
            for rid in mine:
                rv = db.query(MehramReportReview).filter(MehramReportReview.submission_id == s.id, MehramReportReview.report_id == rid).first()
                if rv:
                    rv.status, rv.reason, rv.reviewed_by, rv.reviewed_at = 'rejected', reason, admin.username, now
                else:
                    db.add(MehramReportReview(submission_id=s.id, report_id=rid, status='rejected', reason=reason, reviewed_by=admin.username, reviewed_at=now))
        db.commit()
        reviews = _load_reviews(db, [s.id for s in subs])
        approvals = _load_approvals(db, [s.id for s in subs])
        return [{"id": s.id, **_approval_fields(s, reviews.get(s.id), approvals.get(s.id))} for s in subs]
    finally:
        db.close()


class SubmissionApproval(BaseModel):
    submission_ids: List[int]
    approve: bool = True


@app.post("/admin/events/{event_id}/submissions/approval")
def set_submissions_approval(event_id: int, data: SubmissionApproval, admin: Promoter = Depends(get_admin_user)):
    """Approve (snapshot) or withdraw reports for the event's client account."""
    if not can_approve_reports(admin):
        raise HTTPException(status_code=403, detail="شما اجازه تایید گزارش را ندارید")
    db = SessionLocal()
    try:
        import copy
        subs = db.query(EventSubmission).filter(EventSubmission.event_id == event_id, EventSubmission.id.in_(data.submission_ids)).all()
        now = datetime.utcnow()
        for s in subs:
            if data.approve:
                snapshot = _client_view_data(copy.deepcopy(s.data))
                # Keep the client's own image flags across re-approvals.
                client_flags = (s.approved_data or {}).get('_flags')
                if client_flags:
                    snapshot['_flags'] = client_flags
                s.approved_data, s.approved_at, s.approved_by = snapshot, now, admin.username
            else:
                s.approved_data, s.approved_at, s.approved_by = None, None, None
        db.commit()
        return [{"id": s.id, **_approval_fields(s)} for s in subs]
    finally:
        db.close()


@app.post("/admin/events/{event_id}/submissions/{submission_id}/flag")
def flag_submission_image(event_id: int, submission_id: int, data: FlagImageRequest, admin: Promoter = Depends(get_panel_user)):
    db = SessionLocal()
    try:
        _ensure_event_scope(db, admin, event_id)
        submission = db.query(EventSubmission).filter(EventSubmission.id == submission_id, EventSubmission.event_id == event_id).first()
        if not submission:
            raise HTTPException(status_code=404, detail="Submission not found")
        
        # A client account flags its own (approved) copy; our review flags stay ours.
        col = "data" if admin.is_admin else "approved_data"
        if getattr(submission, col) is None:
            raise HTTPException(status_code=404, detail="Submission not found")

        # We must clone the data dict because SQLAlchemy won't detect nested JSON updates
        import copy
        new_data = copy.deepcopy(getattr(submission, col))
        if "_flags" not in new_data:
            new_data["_flags"] = {}
        
        # Build key (e.g. "camera_checkin" or "checklist_1_2")
        key = data.field_id
        if data.index is not None:
            key = f"{data.field_id}_{data.index}"
            
        new_data["_flags"][key] = {
            "status": "flagged",
            "reason": data.reason,
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }
        
        setattr(submission, col, new_data)
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(submission, col)
        db.commit()
        return {"ok": True, "flags": new_data["_flags"]}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        err = traceback.format_exc()
        print("ERROR IN FLAG:", err)
        raise HTTPException(status_code=500, detail=str(err))
    finally:
        db.close()

@app.post("/admin/events/{event_id}/submissions/{submission_id}/unflag")
def unflag_submission_image(event_id: int, submission_id: int, data: FlagImageRequest, admin: Promoter = Depends(get_panel_user)):
    db = SessionLocal()
    try:
        _ensure_event_scope(db, admin, event_id)
        submission = db.query(EventSubmission).filter(EventSubmission.id == submission_id, EventSubmission.event_id == event_id).first()
        if not submission:
            raise HTTPException(status_code=404, detail="Submission not found")
        
        col = "data" if admin.is_admin else "approved_data"
        if getattr(submission, col) is None:
            raise HTTPException(status_code=404, detail="Submission not found")

        import copy
        new_data = copy.deepcopy(getattr(submission, col))
        if "_flags" not in new_data:
            return {"ok": True, "flags": {}}
        
        key = data.field_id
        if data.index is not None:
            key = f"{data.field_id}_{data.index}"
            
        if key in new_data["_flags"]:
            del new_data["_flags"][key]
            
            setattr(submission, col, new_data)
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(submission, col)
            db.commit()
            
        return {"ok": True, "flags": new_data.get("_flags", {})}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()

@app.get("/admin/events/{event_id}/setup-submissions")
def get_setup_submissions(event_id: int, admin: Promoter = Depends(get_panel_user)):
    db = SessionLocal()
    try:
        _ensure_event_scope(db, admin, event_id)
        if not admin.is_admin:
            return []  # setup reports have no approval step, so a client account never sees them
        subs = db.query(SetupSubmission).filter(SetupSubmission.event_id == event_id).order_by(SetupSubmission.submitted_at.desc()).all()
        # fetch promoter names
        promoter_ids = [s.promoter_id for s in subs if s.promoter_id]
        promoters = db.query(Promoter).filter(Promoter.id.in_(promoter_ids)).all()
        promoter_map = {p.id: p.full_name or p.username for p in promoters}
        
        return [{"id": s.id, "promoter_id": s.promoter_id, "promoter_name": promoter_map.get(s.promoter_id, "Unknown"), "phase": s.phase, "data": s.data, "submitted_at": s.submitted_at.isoformat() + 'Z'} for s in subs]
    finally:
        db.close()
# ==================== DATABASE BACKUP ====================

@app.get("/admin/backup")
def backup_database(admin: Promoter = Depends(get_admin_user)):
    """Download database backup"""
    if not os.path.exists(DB_PATH):
        raise HTTPException(status_code=404, detail="Database file not found")

    backup_name = f"promoters_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
    return FileResponse(
        DB_PATH,
        media_type="application/octet-stream",
        filename=backup_name
    )


# ==================== PDF EXPORT ====================

@app.get("/admin/reports/export-pdf")
def export_reports_pdf(
    team: Optional[str] = None,
    promoter: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    admin: Promoter = Depends(get_admin_user)
):
    """Export reports to PDF file"""
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
    except ImportError:
        raise HTTPException(status_code=500, detail="reportlab not installed")
    
    db = SessionLocal()
    try:
        query = db.query(Report).order_by(Report.id.desc())
        
        if team:
            query = query.filter(Report.team_name == team)
        if promoter:
            query = query.filter(Report.promoter_name == promoter)
        if date_from:
            query = query.filter(Report.date >= date_from)
        if date_to:
            query = query.filter(Report.date <= date_to)
        
        reports = query.all()
        
        # Create PDF
        output = io.BytesIO()
        doc = SimpleDocTemplate(output, pagesize=landscape(A4), rightMargin=30, leftMargin=30, topMargin=30, bottomMargin=30)
        
        elements = []
        styles = getSampleStyleSheet()

        # Register Persian-capable font for correct PDF rendering
        font_name = "Helvetica"
        font_path = os.path.join(os.path.dirname(__file__), "fonts", "Vazirmatn-Regular.ttf")
        if os.path.exists(font_path):
            try:
                pdfmetrics.registerFont(TTFont("Vazirmatn", font_path))
                font_name = "Vazirmatn"
            except Exception as font_error:
                print(f"Font registration failed: {font_error}")

        styles['Normal'].fontName = font_name
        styles['Heading1'].fontName = font_name
        
        # Title
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=18,
            alignment=1,
            spaceAfter=30,
            fontName=font_name
        )
        elements.append(Paragraph("گزارش پروموترها - VU Team", title_style))
        elements.append(Spacer(1, 20))
        
        # Table data
        data = [["ردیف", "تاریخ", "تیم", "پروموتر", "فروشگاه", "مبلغ"]]
        
        for idx, report in enumerate(reports[:100], 1):  # Limit to 100 for PDF
            data.append([
                str(idx),
                report.date or "",
                report.team_name or "",
                report.promoter_name or "",
                report.store_name or "",
                str(report.transaction_amount or "")
            ])
        
        # Create table
        table = Table(data, colWidths=[40, 80, 100, 100, 150, 80])
        table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, -1), font_name),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3e3663')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTSIZE', (0, 0), (-1, 0), 12),
            ('FONTSIZE', (0, 1), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f5f7fa')),
            ('TEXTCOLOR', (0, 1), (-1, -1), colors.black),
            ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#e2e8f0')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9fa')]),
        ]))
        
        elements.append(table)
        
        # Build PDF
        doc.build(elements)
        output.seek(0)
        
        filename = f"reports_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
        
        return StreamingResponse(
            output,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    finally:
        db.close()



# ==================== CHAT ENDPOINTS ====================

class ChatMessageCreate(BaseModel):
    receiver_id: int
    message: str
    event_id: Optional[int] = None

@app.post("/chat/send")
def send_message(data: ChatMessageCreate, user: Promoter = Depends(get_current_user)):
    db = SessionLocal()
    try:
        msg = ChatMessage(
            sender_id=user.id,
            receiver_id=data.receiver_id,
            message=data.message,
            event_id=data.event_id
        )
        db.add(msg)
        # Create notification for receiver
        notif = Notification(
            user_id=data.receiver_id,
            title="پیام جدید",
            message=f"پیام از {user.full_name or user.username}: {data.message[:50]}",
            type="chat",
            data=str({"sender_id": user.id})
        )
        db.add(notif)
        db.commit()
        db.refresh(msg)
        return {
            "id": msg.id,
            "sender_id": msg.sender_id,
            "receiver_id": msg.receiver_id,
            "message": msg.message,
            "is_read": msg.is_read,
            "created_at": msg.created_at.isoformat() + 'Z'
        }
    finally:
        db.close()

@app.get("/chat/messages/{other_user_id}")
def get_messages(other_user_id: int, user: Promoter = Depends(get_current_user)):
    db = SessionLocal()
    try:
        from sqlalchemy import or_, and_
        msgs = db.query(ChatMessage).filter(
            or_(
                and_(ChatMessage.sender_id == user.id, ChatMessage.receiver_id == other_user_id),
                and_(ChatMessage.sender_id == other_user_id, ChatMessage.receiver_id == user.id)
            )
        ).order_by(ChatMessage.created_at.asc()).all()
        # Mark as read
        for m in msgs:
            if m.receiver_id == user.id and not m.is_read:
                m.is_read = True
        db.commit()
        return [{"id": m.id, "sender_id": m.sender_id, "receiver_id": m.receiver_id,
                 "message": m.message, "is_read": m.is_read,
                 "created_at": m.created_at.isoformat() + 'Z'} for m in msgs]
    finally:
        db.close()

@app.get("/chat/admin-id")
def get_chat_admin_id(user: Promoter = Depends(get_current_user)):
    """Resolve which user id promoters should chat with, instead of assuming admin id 1."""
    db = SessionLocal()
    try:
        admin = db.query(Promoter).filter(Promoter.is_admin == True).order_by(Promoter.id.asc()).first()
        return {"admin_id": admin.id if admin else None}
    finally:
        db.close()

@app.get("/chat/unread-count")
def get_chat_unread_count(user: Promoter = Depends(get_current_user)):
    db = SessionLocal()
    try:
        count = db.query(ChatMessage).filter(
            ChatMessage.receiver_id == user.id,
            ChatMessage.is_read == False
        ).count()
        return {"count": count}
    finally:
        db.close()

@app.get("/admin/chat/promoters")
def get_chat_promoters(admin: Promoter = Depends(get_admin_user)):
    """Get all promoters with last message and unread count for admin chat"""
    db = SessionLocal()
    try:
        from sqlalchemy import or_, and_, func
        promoters = db.query(Promoter).filter(Promoter.is_admin == False).all()
        result = []
        now = datetime.utcnow()
        for p in promoters:
            # Last message
            last_msg = db.query(ChatMessage).filter(
                or_(
                    and_(ChatMessage.sender_id == admin.id, ChatMessage.receiver_id == p.id),
                    and_(ChatMessage.sender_id == p.id, ChatMessage.receiver_id == admin.id)
                )
            ).order_by(ChatMessage.created_at.desc()).first()
            # Unread count
            unread = db.query(ChatMessage).filter(
                ChatMessage.sender_id == p.id,
                ChatMessage.receiver_id == admin.id,
                ChatMessage.is_read == False
            ).count()
            is_online = False
            if p.last_seen:
                is_online = (now - p.last_seen).total_seconds() < 300
            result.append({
                "id": p.id,
                "username": p.username,
                "full_name": p.full_name,
                "team_name": p.team_name,
                "is_online": is_online,
                "unread_count": unread,
                "last_message": last_msg.message if last_msg else None,
                "last_message_at": last_msg.created_at.isoformat() + 'Z' if last_msg else None,
                "last_message_mine": last_msg.sender_id == admin.id if last_msg else None
            })
        result.sort(key=lambda x: x["last_message_at"] or "", reverse=True)
        return result
    finally:
        db.close()

# ─── ATTENDANCE ENDPOINTS ──────────────────────────────────────────────────

class LocationInput(BaseModel):
    latitude: float
    longitude: float

class AttendanceClockOutAction(LocationInput):
    daily_notes: Optional[str] = None
    checklist: Optional[list] = None

@app.get("/attendance/my")
def get_my_attendance(user: Promoter = Depends(get_current_user)):
    db = SessionLocal()
    try:
        records = (db.query(Attendance)
                     .filter(Attendance.promoter_id == user.id)
                     .order_by(Attendance.date.desc())
                     .all())
        return [{
            "id": r.id,
            "date": r.date,
            "clock_in_time": r.clock_in_time.isoformat() + 'Z' if r.clock_in_time else None,
            "clock_out_time": r.clock_out_time.isoformat() + 'Z' if r.clock_out_time else None,
            "daily_notes": r.daily_notes,
        } for r in records]
    finally:
        db.close()


@app.get("/attendance/status")
def get_attendance_status(user: Promoter = Depends(get_current_user)):
    db = SessionLocal()
    try:
        today_str = datetime.utcnow().strftime("%Y-%m-%d")
        att = db.query(Attendance).filter(
            Attendance.promoter_id == user.id,
            Attendance.date == today_str
        ).first()

        if not att:
            return {"status": "not_clocked_in"}
        if att.clock_out_time is None:
            return {
                "status": "clocked_in",
                "clock_in_time": att.clock_in_time.isoformat() + 'Z'
            }
        return {
            "status": "clocked_out",
            "clock_in_time": att.clock_in_time.isoformat() + 'Z',
            "clock_out_time": att.clock_out_time.isoformat() + 'Z'
        }
    finally:
        db.close()


@app.post("/attendance/clock-in")
def clock_in(data: LocationInput, user: Promoter = Depends(get_current_user)):
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        today_str = now.strftime("%Y-%m-%d")
        
        # Check if already clocked in today
        existing = db.query(Attendance).filter(
            Attendance.promoter_id == user.id,
            Attendance.date == today_str
        ).first()
        
        if existing:
            raise HTTPException(status_code=400, detail="Already clocked in today")
            
        att = Attendance(
            promoter_id=user.id,
            date=today_str,
            clock_in_time=now,
            clock_in_lat=data.latitude,
            clock_in_lon=data.longitude
        )
        db.add(att)
        db.commit()
        return {"detail": "Clocked in successfully"}
    finally:
        db.close()


@app.post("/attendance/clock-out")
def clock_out(data: AttendanceClockOutAction, user: Promoter = Depends(get_current_user)):
    db = SessionLocal()
    try:
        today_str = datetime.utcnow().strftime("%Y-%m-%d")
        att = db.query(Attendance).filter(
            Attendance.promoter_id == user.id,
            Attendance.date == today_str
        ).first()
        
        if not att:
            raise HTTPException(status_code=400, detail="Not clocked in today")
        if att.clock_out_time is not None:
            raise HTTPException(status_code=400, detail="Already clocked out today")
            
        att.clock_out_time = datetime.utcnow()
        att.clock_out_lat = data.latitude
        att.clock_out_lon = data.longitude
        if data.daily_notes is not None:
            att.daily_notes = data.daily_notes
        if data.checklist is not None:
            att.checklist = data.checklist
            
        db.commit()
        return {"detail": "Clocked out successfully"}
    finally:
        db.close()


@app.get("/admin/attendance")
def get_admin_attendance(admin: Promoter = Depends(get_panel_user)):
    db = SessionLocal()
    try:
        records = db.query(Attendance).order_by(Attendance.clock_in_time.desc()).all()
        allowed = _scoped_event_ids(db, admin)
        if allowed is not None:
            ids = {p.id for p in db.query(Promoter).filter(Promoter.event_id.in_(allowed)).all()}
            records = [r for r in records if r.promoter_id in ids]
        result = []
        for r in records:
            promoter = db.query(Promoter).filter(Promoter.id == r.promoter_id).first()
            result.append({
                "id": r.id,
                "promoter_id": r.promoter_id,
                "promoter_name": promoter.full_name if promoter else "Unknown",
                "promoter_username": promoter.username if promoter else "Unknown",
                "date": r.date,
                "clock_in_time": r.clock_in_time.isoformat() + 'Z' if r.clock_in_time else None,
                "clock_in_lat": r.clock_in_lat,
                "clock_in_lon": r.clock_in_lon,
                "clock_out_time": r.clock_out_time.isoformat() + 'Z' if r.clock_out_time else None,
                "clock_out_lat": r.clock_out_lat,
                "clock_out_lon": r.clock_out_lon,
                "daily_notes": r.daily_notes,
                "checklist": r.checklist
            })
        return result
    finally:
        db.close()


class ClientCreate(BaseModel):
    name: str

class ClientUpdate(BaseModel):
    name: Optional[str] = None
    logo_url: Optional[str] = None

@app.get("/clients")
def get_clients(admin: Promoter = Depends(get_admin_user)):
    db = SessionLocal()
    try:
        return [{"id": c.id, "name": c.name, "logo_url": c.logo_url} for c in db.query(Client).order_by(Client.name).all()]
    finally:
        db.close()

@app.post("/clients")
def create_client(client_in: ClientCreate, admin: Promoter = Depends(get_admin_user)):
    name = client_in.name.strip().lower()
    if not name:
        raise HTTPException(status_code=400, detail="Client name cannot be empty")
    db = SessionLocal()
    try:
        existing = db.query(Client).filter(Client.name == name).first()
        if not existing:
            existing = Client(name=name)
            db.add(existing)
            db.commit()
            db.refresh(existing)
        return {"id": existing.id, "name": existing.name, "logo_url": existing.logo_url}
    finally:
        db.close()

@app.put("/clients/{client_id}")
def update_client(client_id: int, data: ClientUpdate, admin: Promoter = Depends(get_admin_user)):
    db = SessionLocal()
    try:
        client = db.query(Client).filter(Client.id == client_id).first()
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        if data.name is not None:
            name = data.name.strip().lower()
            if not name:
                raise HTTPException(status_code=400, detail="Client name cannot be empty")
            client.name = name
        if data.logo_url is not None:
            client.logo_url = data.logo_url
        db.commit()
        db.refresh(client)
        return {"id": client.id, "name": client.name, "logo_url": client.logo_url}
    finally:
        db.close()

@app.delete("/clients/{client_id}")
def delete_client(client_id: int, admin: Promoter = Depends(get_admin_user)):
    db = SessionLocal()
    try:
        client = db.query(Client).filter(Client.id == client_id).first()
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")
        db.delete(client)
        db.commit()
        return {"ok": True}
    finally:
        db.close()

