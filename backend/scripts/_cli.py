"""Shared helpers for the command-line scripts: logging, friendly errors, tables."""
import logging
import sys

import psycopg

from app.config import settings
from app.ingestion.open_meteo import OpenMeteoError
from app.ingestion.pipeline import IngestionBusy, RunResult


def run_cli(main) -> None:
    """Run a script's main() and turn the usual problems into plain messages."""
    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s", datefmt="%H:%M:%S")
    logging.getLogger("httpx").setLevel(logging.WARNING)      # don't print every request URL
    try:
        main()
    except psycopg.OperationalError as exc:
        first_line = str(exc).strip().splitlines()[0] if str(exc).strip() else repr(exc)
        print(f"\nCould not connect to PostgreSQL at {settings.db_host}:{settings.db_port}, "
              f"database '{settings.db_name}', user '{settings.db_user}':\n  {first_line}")
        print("Check the DB_... values in the .env file in the project folder "
              "(a wrong DB_PASSWORD is the usual cause).")
        sys.exit(1)
    except IngestionBusy as exc:
        print(f"\nNot started: {exc}")
        sys.exit(2)
    except OpenMeteoError as exc:
        print(f"\nCould not download from Open-Meteo: {exc}\nIs the internet connection working?")
        sys.exit(3)


def print_result(result: RunResult) -> None:
    print(f"\nRun #{result.run_id} ({result.run_type}) finished:")
    print(f"  readings downloaded : {result.readings_fetched}")
    print(f"  new readings stored : {result.readings_inserted}"
          f"   (already stored or older, skipped: {result.readings_fetched - result.readings_inserted})")
    print(f"  forecast days saved : {result.forecasts_saved}")
    print(f"  warnings raised     : {result.warnings_raised}   (created or upgraded by the trigger)")


def print_table(title: str, rows: list[dict]) -> None:
    """Print query results as a simple text table."""
    print(f"\n== {title} ==")
    if not rows:
        print("(no rows)")
        return
    columns = list(rows[0].keys())
    cells = [[("" if row[c] is None else str(row[c])) for c in columns] for row in rows]
    widths = [max(len(c), *(len(r[i]) for r in cells)) for i, c in enumerate(columns)]
    print("  ".join(c.ljust(w) for c, w in zip(columns, widths)))
    print("  ".join("-" * w for w in widths))
    for r in cells:
        print("  ".join(v.ljust(w) for v, w in zip(r, widths)))
