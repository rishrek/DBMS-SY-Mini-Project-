"""
Create (or update) the admin account and one demo user per region.

Passwords come ONLY from the .env file:
    ADMIN_EMAIL, ADMIN_PASSWORD            -> the admin account
    DEMO_USER_PASSWORD (optional)          -> one demo user per region, e.g.
                                              colaba.demo@example.com
Running it again updates the same accounts (ON CONFLICT on email), so it never
makes duplicates. example.com is a domain reserved for examples: no real mailboxes.

    cd backend
    .venv/bin/python -m scripts.create_users
"""
import sys

from app import db
from app.config import settings
from app.security import hash_password
from scripts._cli import print_table, run_cli


def main() -> None:
    if not settings.admin_email or not settings.admin_password:
        print("Set ADMIN_EMAIL and ADMIN_PASSWORD in the .env file first (see .env.example).")
        sys.exit(1)
    for label, password in (("ADMIN_PASSWORD", settings.admin_password),
                            ("DEMO_USER_PASSWORD", settings.demo_user_password)):
        if password and not 8 <= len(password.encode("utf-8")) <= 72:
            print(f"{label} must be 8 to 72 characters long.")
            sys.exit(1)

    accounts = [{"name": settings.admin_name, "email": settings.admin_email.strip().lower(),
                 "region": settings.admin_region, "role": "admin", "password": settings.admin_password}]

    with db.connect() as conn:
        if settings.demo_user_password:
            for region in db_regions(conn):
                accounts.append({"name": f"{region} resident (demo)",
                                 "email": f"{region.lower().replace(' ', '-')}.demo@example.com",
                                 "region": region, "role": "user", "password": settings.demo_user_password})

        saved = []
        with conn.transaction():                      # all accounts, or none
            for a in accounts:
                row = conn.execute(db.load_sql("admin/upsert_user"), {
                    "region": a["region"], "name": a["name"], "email": a["email"],
                    "password_hash": hash_password(a["password"]), "role": a["role"],
                }).fetchone()
                saved.append({"user_id": row["user_id"], "email": row["email"],
                              "role": row["role"], "region": a["region"]})

    print_table(f"Accounts created or updated: {len(saved)} (passwords are the ones in .env)", saved)
    if not settings.demo_user_password:
        print("\nNo demo users made: set DEMO_USER_PASSWORD in .env to get one per region.")


def db_regions(conn) -> list[str]:
    return [r["region"] for r in conn.execute(db.load_sql("public/regions")).fetchall()]


if __name__ == "__main__":
    run_cli(main)
