import os
from passlib.context import CryptContext
import jwt
from datetime import datetime, timedelta
from fastapi import HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from dotenv import load_dotenv
from cryptography.fernet import Fernet, InvalidToken
from models import SessionLocal, Promoter

# Loaded here (not just in main.py) so this module is self-sufficient no matter
# which entrypoint imports it first (main.py, create_admin.py, reset_password.py, migrate.py).
load_dotenv()

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY environment variable is not set. Add it to backend/app/.env "
        "(see .env.example) before starting the server."
    )
ALGORITHM = "HS256"
# Promoters/admins should stay signed in on their device until they explicitly log
# out, not get silently kicked back to the login screen every day — so this is a
# long-lived "remember me" style session rather than a short security-sensitive one.
ACCESS_TOKEN_EXPIRE_MINUTES = 60*24*90  # 90 روز

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

# Used to encrypt promoter passwords stored for admin visibility (see plain_password
# on the Promoter model) so a DB leak alone doesn't expose them in cleartext.
_ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")
_fernet = Fernet(_ENCRYPTION_KEY.encode()) if _ENCRYPTION_KEY else None


def encrypt_value(value: str | None) -> str | None:
    if value is None or _fernet is None:
        return None
    return _fernet.encrypt(value.encode()).decode()


def decrypt_value(token: str | None) -> str | None:
    if token is None or _fernet is None:
        return None
    try:
        return _fernet.decrypt(token.encode()).decode()
    except InvalidToken:
        return None

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def verify_password(plain, hashed):
    return pwd_context.verify(plain, hashed)

def get_password_hash(password):
    return pwd_context.hash(password)

def authenticate_user(db: Session, username: str, password: str):
    user = db.query(Promoter).filter(Promoter.username == username).first()
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta if expires_delta else timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
        username: str = payload.get("sub")
        if user_id is None and username is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception

    user = None
    if user_id is not None:
        user = db.query(Promoter).filter(Promoter.id == user_id).first()
    if user is None and username:
        user = db.query(Promoter).filter(Promoter.username == username).first()

    if user is None:
        raise credentials_exception
    return user


# Only these accounts may approve clients, archive/unarchive and delete events.
EVENT_MANAGER_USERNAMES = {"kave", "s.parmida", "k-parisa"}


# Our admins who approve reports before a client-scoped account can see them.
REPORT_APPROVER_USERNAMES = {"farshid76", "k-parisa", "s.parmida", "masih", "kave", "gman", "mahdieh"}  # gman = Sasan


def can_approve_reports(user) -> bool:
    return bool(getattr(user, "is_admin", False)) and (user.username or "").strip().lower() in REPORT_APPROVER_USERNAMES


def client_scope(user):
    """Lower-cased client name a client-scoped panel account is limited to, else None."""
    return (getattr(user, "admin_client", None) or "").strip().lower() or None


def can_manage_events(user) -> bool:
    return bool(getattr(user, "is_admin", False)) and (user.username or "").strip().lower() in EVENT_MANAGER_USERNAMES
