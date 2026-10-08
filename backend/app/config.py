"""
Settings, read from the .env file in the project folder (never from the code).

pydantic-settings matches each field below to an environment variable with the
same name in upper case, e.g. db_password <- DB_PASSWORD. A real environment
variable wins over the .env file, which is handy for testing against another
database:  DB_PORT=5433 .venv/bin/python -m scripts.report
"""
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/config.py -> parents[2] is the project folder that holds .env
PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",            # unknown lines in .env are fine
    )

    # --- PostgreSQL connection -------------------------------------------------
    # Separate fields (not one URL), so a password with special characters like
    # @ or # needs no escaping.
    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "climate_db"
    db_user: str = "postgres"
    db_password: str = ""          # no default secret: put yours in .env

    # All dates and times in this project are Indian Standard Time.
    timezone: str = "Asia/Kolkata"

    # Seconds to wait for Open-Meteo before giving up on a request.
    open_meteo_timeout: float = 60.0

    # --- Web login (Phase 4) ------------------------------------------------------
    jwt_secret: str = ""           # signs login tokens; if empty, a temporary one is made at start-up
    jwt_expire_hours: int = 8      # how long a login lasts

    # Accounts made by scripts/create_users.py (passwords only ever come from .env)
    admin_email: str = ""
    admin_password: str = ""
    admin_name: str = "Administrator"
    admin_region: str = "Santacruz"
    demo_user_password: str = ""

    # Websites allowed to call the API from a browser (the React dev server), comma-separated.
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # Run the 15-minute Open-Meteo job inside the API server.
    enable_scheduler: bool = True

    # Live updates (/api/live): seconds between the "still here" lines that keep a quiet stream open.
    live_heartbeat_seconds: float = 15.0

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
