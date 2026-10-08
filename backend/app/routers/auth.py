"""Register, log in, and "who am I"."""
import psycopg
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from ..db import get_conn, load_sql
from ..queries import fetch_one
from ..schemas import RegisterIn, TokenOut, UserOut
from ..security import create_token, get_current_user, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED,
             summary="Create a user account (always role 'user')")
def register(body: RegisterIn, conn: psycopg.Connection = Depends(get_conn)):
    if fetch_one(conn, "public/region_by_id", {"region_id": body.region_id}) is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unknown region.")
    try:
        new = conn.execute(load_sql("auth/insert_user"), {
            "region_id": body.region_id, "name": body.name, "email": body.email,
            "password_hash": hash_password(body.password),
        }).fetchone()
    except psycopg.errors.UniqueViolation:           # UNIQUE(email) said no
        raise HTTPException(status.HTTP_409_CONFLICT, detail="An account with this email already exists.")
    return fetch_one(conn, "auth/user_by_id", {"user_id": new["user_id"]})


@router.post("/login", response_model=TokenOut,
             summary="Log in with email (as 'username') and password; returns a token")
def login(form: OAuth2PasswordRequestForm = Depends(), conn: psycopg.Connection = Depends(get_conn)):
    user = fetch_one(conn, "auth/user_by_email", {"email": form.username.strip().lower()})
    if user is None or not verify_password(form.password, user["password_hash"]):
        # Same message either way, so nobody can find out which emails have accounts.
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Wrong email or password.")
    profile = fetch_one(conn, "auth/user_by_id", {"user_id": user["user_id"]})
    return {"access_token": create_token(profile), "token_type": "bearer", "user": profile}


@router.get("/me", response_model=UserOut, summary="The logged-in user")
def me(user: dict = Depends(get_current_user)):
    return user
