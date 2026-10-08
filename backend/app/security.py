"""
Passwords, login tokens and role checks.

  * Passwords are stored only as bcrypt hashes. bcrypt adds a random "salt" to
    every hash, so two users with the same password get different hashes.
  * After logging in, the browser gets a JWT (JSON Web Token): a small signed
    note saying "user 7, valid until 06:00". The server can check the signature
    with JWT_SECRET, so it needs no session table.
  * Each request re-reads the user from APP_USER, so a changed role or a
    deleted user takes effect at once, even while an old token is still valid.
"""
import logging
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
import psycopg
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from .config import settings
from .db import borrow, get_conn, load_sql

log = logging.getLogger(__name__)

JWT_ALGORITHM = "HS256"
_jwt_secret = settings.jwt_secret
if not _jwt_secret:
    # No secret in .env: make a temporary random one. Works, but every restart
    # logs everyone out. Set JWT_SECRET in .env to keep logins across restarts.
    _jwt_secret = secrets.token_hex(32)
    log.warning("JWT_SECRET is not set in .env; using a temporary secret (logins end when the server restarts)")

# Tells Swagger's "Authorize" button where to log in. auto_error=False lets us
# write our own friendly 401 message.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


# ------------------------------------------------------------------ passwords
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("ascii"))
    except ValueError:              # malformed hash, or a password longer than bcrypt's 72 bytes
        return False


# --------------------------------------------------------------------- tokens
def create_token(user: dict) -> str:
    payload = {
        "sub": str(user["user_id"]),                     # "subject": who the token is for
        "role": user["role"],                            # for the browser's convenience only
        "exp": datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expire_hours),
    }
    return jwt.encode(payload, _jwt_secret, algorithm=JWT_ALGORITHM)


def _unauthorized(message: str) -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, detail=message,
                         headers={"WWW-Authenticate": "Bearer"})


def _user_from_token(token: str, conn: psycopg.Connection) -> dict:
    try:
        payload = jwt.decode(token, _jwt_secret, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise _unauthorized("Your login has expired. Please log in again.")
    except jwt.InvalidTokenError:
        raise _unauthorized("Invalid login token. Please log in again.")
    user = conn.execute(load_sql("auth/user_by_id"), {"user_id": int(payload["sub"])}).fetchone()
    if user is None:
        raise _unauthorized("This account no longer exists.")
    return user


# ---------------------------------------------------------- FastAPI dependencies
def get_current_user(token: str | None = Depends(oauth2_scheme),
                     conn: psycopg.Connection = Depends(get_conn)) -> dict:
    """The logged-in user, or 401 if there is no valid token."""
    if token is None:
        raise _unauthorized("Please log in first.")
    return _user_from_token(token, conn)


def get_optional_user(token: str | None = Depends(oauth2_scheme),
                      conn: psycopg.Connection = Depends(get_conn)) -> dict | None:
    """The logged-in user if there is a valid token, otherwise None (no error)."""
    if token is None:
        return None
    try:
        return _user_from_token(token, conn)
    except HTTPException:
        return None


def login_for_stream(token: str | None) -> tuple[dict, datetime]:
    """For the live stream (/api/live): check the login ONCE and say when it expires.
    The stream stays open for hours, so it must not hold a pool connection all that
    time (Depends(get_conn) would): this borrows one just for the check."""
    if token is None:
        raise _unauthorized("Please log in first.")
    with borrow() as conn:
        user = _user_from_token(token, conn)                  # 401 if invalid, expired or deleted
    expires = jwt.decode(token, _jwt_secret, algorithms=[JWT_ALGORITHM])["exp"]
    return user, datetime.fromtimestamp(expires, timezone.utc)


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Only admins may continue; others get 403 Forbidden."""
    if user["role"] != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Only admins can do this.")
    return user
