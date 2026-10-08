"""
VIVA.md must show the SQL that really runs.

Every ```sql block in VIVA.md is compared with the project's .sql files (comments and
spacing ignored). Blocks that start with "-- example" are extra queries for pgAdmin; the
ones without %(name)s placeholders are EXPLAINed on the test database, so they must be
valid SQL against our real tables.
"""
import re
from pathlib import Path

from app import db

PROJECT = Path(__file__).resolve().parents[2]
VIVA = (PROJECT / "VIVA.md").read_text(encoding="utf-8")
BLOCKS = re.findall(r"```sql\n(.*?)```", VIVA, flags=re.S)
SQL_FILES = sorted((PROJECT / "backend" / "app" / "sql").rglob("*.sql"))


def normalise(sql: str) -> str:
    """Drop -- comments and collapse all spacing, so only the SQL itself is compared."""
    without_comments = "\n".join(line.split("--", 1)[0] for line in sql.splitlines())
    return " ".join(without_comments.split())


def test_viva_sql_matches_the_files():
    files = [normalise(p.read_text(encoding="utf-8"))
             for p in SQL_FILES + sorted((PROJECT / "database").glob("*.sql"))]
    stale = [b.splitlines()[0] for b in BLOCKS
             if not b.startswith("-- example") and not any(normalise(b) in f for f in files)]
    assert BLOCKS and not stale, f"VIVA.md shows SQL that no file contains any more: {stale}"


def test_viva_lists_every_sql_file():
    missing = [p.relative_to(PROJECT).as_posix() for p in SQL_FILES
               if p.relative_to(PROJECT).as_posix() not in VIVA]
    assert not missing, f"Add these files to VIVA.md section 9.8: {missing}"


def test_viva_example_queries_run(database):
    examples = [b for b in BLOCKS if b.startswith("-- example") and "%(" not in b]
    assert examples
    with db.connect() as conn:
        for sql in examples:
            conn.execute("EXPLAIN " + sql)          # plans the query without running it
