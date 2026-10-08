"""
Checks on the SQL files themselves (no database needed).

psycopg reads %(name)s placeholders ANYWHERE in the query text, even inside a
"-- comment". A comment like "-- %(x)s IS NULL" makes psycopg demand a parameter
called x, and the query fails. (This bug happened once in Phase 4; this test
makes sure it can't come back.)
"""
from pathlib import Path

SQL_DIR = Path(__file__).resolve().parents[1] / "app" / "sql"


def test_no_percent_sign_inside_sql_comments():
    offenders = []
    for path in sorted(SQL_DIR.rglob("*.sql")):
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if "--" in line and "%" in line.split("--", 1)[1]:
                offenders.append(f"{path.relative_to(SQL_DIR)}:{number}: {line.strip()}")
    assert not offenders, "Remove '%' from these SQL comments:\n" + "\n".join(offenders)


def test_every_placeholder_is_well_formed():
    # Placeholders must look like %(name)s; a lone % would make psycopg fail.
    import re
    bad = []
    for path in sorted(SQL_DIR.rglob("*.sql")):
        code = "\n".join(l.split("--", 1)[0] for l in path.read_text(encoding="utf-8").splitlines())
        leftover = re.sub(r"%\(\w+\)s", "", code)
        if "%" in leftover:
            bad.append(str(path.relative_to(SQL_DIR)))
    assert not bad, f"Malformed placeholder in: {bad}"
