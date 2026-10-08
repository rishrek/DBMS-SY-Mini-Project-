"""
Load the last N days (default 90) of hourly readings for every station, plus
the 7-day forecast, from the Open-Meteo Historical Forecast API.

Safe to run again at any time: readings already stored are skipped (ON CONFLICT
DO NOTHING), so a re-run also fills gaps, e.g. after the laptop was switched off.

    cd backend
    .venv/bin/python -m scripts.backfill            # the last 90 days
    .venv/bin/python -m scripts.backfill --days 7   # just the last week
"""
import argparse

from app.ingestion.pipeline import run_ingestion
from scripts._cli import print_result, run_cli


def main() -> None:
    parser = argparse.ArgumentParser(description="Load past hourly readings from Open-Meteo.")
    parser.add_argument("--days", type=int, default=90, help="how many days back to load (1-365, default 90)")
    args = parser.parse_args()
    if not 1 <= args.days <= 365:
        parser.error("--days must be between 1 and 365")
    print_result(run_ingestion("backfill", days=args.days))


if __name__ == "__main__":
    run_cli(main)
