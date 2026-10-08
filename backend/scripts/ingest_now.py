"""
Run one ingestion right now: the same thing the 15-minute job does (readings
every 15 minutes from the live Forecast API, newer than each station's newest
stored one, plus the 7-day forecast). Logged in INGESTION_RUN as run_type 'manual'.

    cd backend
    .venv/bin/python -m scripts.ingest_now
"""
from app.ingestion.pipeline import run_ingestion
from scripts._cli import print_result, run_cli


def main() -> None:
    print_result(run_ingestion("manual"))


if __name__ == "__main__":
    run_cli(main)
