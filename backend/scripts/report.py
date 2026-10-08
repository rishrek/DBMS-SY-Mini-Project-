"""
Print what is in the database: rows per table, readings per station, missing
values, the warnings the trigger raised, and the last ingestion runs.
Every query comes from backend/app/sql/, so you can run the same SQL in pgAdmin.

    cd backend
    .venv/bin/python -m scripts.report
"""
from collections import Counter

from app import db
from scripts._cli import print_table, run_cli


def main() -> None:
    with db.connect() as conn:
        def query(name: str) -> list[dict]:
            return conn.execute(db.load_sql(name)).fetchall()

        print_table("Rows per table  (sql/integrity/row_counts.sql)", query("integrity/row_counts"))
        print_table("Readings per station  (sql/reports/station_coverage.sql)", query("reports/station_coverage"))

        nulls = query("reports/null_counts")[0]
        total = nulls.pop("total_readings")
        missing = [{"column": c, "null_values": n} for c, n in nulls.items() if n]
        print(f"\n== Missing values in WEATHER_DATA  (sql/reports/null_counts.sql) ==")
        print(f"{total} readings x 22 values. "
              + ("Every value is present (0 NULLs in all 22 columns)." if not missing else "Columns with NULLs:"))
        if missing:
            print_table("NULLs per column", missing)

        warnings = query("reports/auto_warnings")
        print_table(f"Warnings raised by the trigger: {len(warnings)}  (sql/reports/auto_warnings.sql)", warnings)
        if warnings:
            by_level = Counter((w["hazard"], w["warning_level"]) for w in warnings)
            print("By hazard and level: " + ", ".join(f"{h} {lvl}: {n}" for (h, lvl), n in sorted(by_level.items())))

        print_table("Last ingestion runs  (sql/reports/recent_runs.sql)", query("reports/recent_runs"))


if __name__ == "__main__":
    run_cli(main)
