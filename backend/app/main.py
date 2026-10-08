"""
The web API.  Start it from the backend folder:

    .venv/bin/python -m uvicorn app.main:app --reload

then open http://127.0.0.1:8000/docs for the interactive Swagger page.
"""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from . import db
from .config import settings
from .errors import register_error_handlers
from .ingestion.scheduler import create_scheduler
from .live import Listener, hub
from .routers import admin_crud, admin_ingestion, admin_warnings, analytics, auth, integrity, live, public

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Runs once when the server starts (before `yield`) and once when it stops."""
    db.open_pool()
    hub.bind(asyncio.get_running_loop())              # the live streams' queues are read on this event loop
    app.state.listener = Listener(hub)                # LISTEN climate_live, in a background thread
    app.state.listener.start()
    app.state.scheduler = None
    if settings.enable_scheduler:
        app.state.scheduler = create_scheduler()      # the Open-Meteo job, every 15 minutes (IST)
        app.state.scheduler.start()
        log.info("Ingestion scheduled every 15 minutes (IST)")
    yield
    if app.state.scheduler:
        app.state.scheduler.shutdown(wait=False)
    app.state.listener.stop()
    db.close_pool()


app = FastAPI(
    title="Climate Intelligence System API",
    version="1.0.0",
    description=(
        "KJS-CES-01: getting the right weather warning to the right place.\n\n"
        "Weather and air-quality data: **Open-Meteo.com** (CC BY 4.0), fetched every 15 minutes. Warnings "
        "are generated automatically with simplified IMD-style thresholds; they are not official IMD warnings.\n\n"
        "Most endpoints need a login: click **Authorize** and enter an email as *username* and "
        "its password. The analytics, integrity and admin endpoints need an admin login."
    ),
    lifespan=lifespan,
    openapi_tags=[
        {"name": "open", "description": "Health check and the region list (no login needed)"},
        {"name": "dashboard", "description": "Warnings, map, conditions, forecast and charts (login needed)"},
        {"name": "live", "description": "A stream that tells the website when data changes (login needed)"},
        {"name": "auth", "description": "Register, log in, who am I"},
        {"name": "analytics", "description": "The DBMS demo queries with their SQL (admin login; "
                                             "user-warning-days: any login, own region)"},
        {"name": "integrity", "description": "The poster's Table 4 checks, run live (admin login)"},
    ],
)

# CORS: allow the React dev server (another "origin", port 5173) to call this API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_error_handlers(app)

for router in (auth.router, public.router, public.dashboard, live.router, analytics.router, integrity.router,
               admin_warnings.router, admin_ingestion.router, admin_crud.meta_router,
               *admin_crud.table_routers):
    app.include_router(router)


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse("/docs")
