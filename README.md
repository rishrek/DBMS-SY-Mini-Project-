# Climate Intelligence System (KJS-CES-01)

**Getting the right weather warning to the right place.** A full-stack website built on our DBMS poster: the poster's
seven BCNF tables in PostgreSQL, a FastAPI backend that runs plain SQL (no ORM), and a React website that shows the
SQL behind every result.

*Aatharva, Risheek B and Anush · B.Tech AI&DS · K J Somaiya School of Engineering, Mumbai*

The poster ended with three next steps. This project does all three:

| Poster's next step | What we built |
|---|---|
| Keep a proper history for each station | `WEATHER_DATA` is keyed on (station, date, time) and holds 90+ days of readings for 10 stations: hourly history, then a new reading every 15 minutes |
| Raise warnings automatically with triggers | An `AFTER INSERT` trigger on `WEATHER_DATA` raises Rain, Heat and Air Quality warnings in `REGION_WARNING` |
| Plug in a live feed | Weather and air-quality data from **Open-Meteo** every 15 minutes. Every open dashboard updates by itself within a second (PostgreSQL `LISTEN`/`NOTIFY`, then Server-Sent Events) |

> Weather and air-quality data: **Open-Meteo.com** (CC BY 4.0). Map © OpenStreetMap contributors. The warnings are
> generated automatically with simplified IMD-style thresholds and are **not official IMD warnings**.

**Preparing for the viva?** [VIVA.md](VIVA.md) has the FDs and BCNF argument for every table, every significant query
explained, the trigger walk-through and the questions we expect, with answers.

## Contents
1. [Quick start: one command](#quick-start-one-command)
2. [What's in the folder](#whats-in-the-folder)
3. [Requirements](#requirements)
4. [Manual setup, step by step (macOS)](#manual-setup-step-by-step-macos)
5. [Everyday use](#everyday-use)
6. [The website's pages](#the-websites-pages)
7. [Handy commands](#handy-commands)
8. [Tests](#tests)
9. [Start again from an empty database](#start-again-from-an-empty-database)
10. [Windows notes](#windows-notes)
11. [Troubleshooting](#troubleshooting)
12. [Data sources and credits](#data-sources-and-credits)

## Quick start: one command

**1. Install these once**, if you don't have them yet:
- **PostgreSQL**, with the EDB installer (postgresql.org → Download; it includes pgAdmin). Remember the password you give
  the `postgres` user.
- **Python 3.12** from python.org (3.13 and 3.14 also work). On Windows, tick *Add python.exe to PATH* in the installer.
- **Node.js**, the LTS version, from nodejs.org.

**2. Get the project.** The repository is private, so rishrek adds you first (*Settings → Collaborators* on GitHub) and
you accept the email invitation. Then, on the repository's GitHub page, click **Code → Download ZIP** and unzip it, or
clone it with GitHub Desktop or git.

**3. Open a terminal in the project folder** (the one with `start.py`) **and run one command:**

| Computer | How to open a terminal there | Command |
|---|---|---|
| macOS | in Terminal, type `cd `, drag the folder into the window, press Enter | `python3 start.py` |
| Windows | open the folder in File Explorer, click the address bar, type `cmd`, press Enter | `py start.py` |

- **The first run** takes a few minutes and needs the internet. It asks two things: your PostgreSQL password, and a new
  password for the website's admin login.
- It then sets everything up by itself: the Python packages, `.env`, the database with 90 days of data, the admin
  account and the website's packages.
- Finally it starts the API and the website and opens the landing page, <http://localhost:5173>, in your browser.
- **After that,** the same command opens the website in a few seconds. Keep its window open while you use the site, and
  press **Ctrl+C** there to stop. Log in as `admin@example.com` with the admin password you chose: the admin login
  also sees the team's pages (Analytics, Integrity, Admin), while accounts made with *Create your account* only see
  the dashboard.
- **The site is live:** new readings arrive every 15 minutes, and a new reading or warning appears on every open
  dashboard within about a second, with no reloading. The dashboard shows "Live · next update around …".

If something is missing, `start.py` says what to do. [The manual steps](#manual-setup-step-by-step-macos) do the same
thing by hand: they show what each step does (useful for the viva) and help when something goes wrong.

## What's in the folder

```
climate-intelligence-system/
├── start.py                     ONE COMMAND: sets everything up and opens the website
├── README.md                    this file: setup and running
├── VIVA.md                      viva notes: FDs and BCNF, every query explained, likely questions
├── .env.example                 settings template: copy it to .env (which git never sees)
├── Climate_Intelligence_Poster_Final.pdf
├── docs/PLAN.md                 the plan we approved before building (Phase 1)
├── database/                    run these in pgAdmin or psql
│   ├── 00_create_database.sql      CREATE DATABASE climate_db (once)
│   ├── reset.sql                   drops everything we created, in a safe order (no CASCADE)
│   ├── 01_schema.sql               the 9 tables, constraints, indexes and FD/BCNF notes
│   ├── 02_seed.sql                 10 regions, 10 stations, 6 CPCB AQI bands, 8 warning thresholds
│   ├── 03_views_functions.sql      warning_rank(), v_current_conditions, region_daily_summary()
│   ├── 04_triggers.sql             the automatic-warning trigger
│   ├── 05_live_updates.sql         live updates: pg_notify triggers (start.py runs it on every start)
│   └── smoke_test.sql              16 checks inside BEGIN … ROLLBACK (changes nothing)
├── backend/                     FastAPI + psycopg 3 (Python 3.12)
│   ├── app/sql/                    EVERY query the backend runs, one .sql file each
│   ├── app/routers/                the API endpoints, including /api/live (the live-update stream)
│   ├── app/live.py                 LISTEN climate_live, and passing each change on to the open pages
│   ├── app/ingestion/              Open-Meteo download, derived values, the 15-minute job
│   ├── scripts/                    backfill, ingest_now, create_users, report, prepare (used by start.py)
│   └── tests/                      pytest, on a separate climate_test database
├── frontend/                    React + Vite + Tailwind + Recharts + Leaflet
│   └── src/pages/                  Landing, Login, Register, Dashboard, Analytics, Integrity, Admin
└── logs/                        written by start.py: api.log and website.log (not in git)
```

The database has 9 tables: the poster's 7 (`LOCATION`, `WEATHER_STATION`, `WEATHER_DATA`, `AQI_CATEGORY`, `APP_USER`,
`REGION_FORECAST`, `REGION_WARNING`, with the poster's column names) and 2 support tables (`WARNING_THRESHOLD`,
`INGESTION_RUN`).

## Requirements

| Tool | Tested with | Notes |
|---|---|---|
| PostgreSQL + pgAdmin 4 | PostgreSQL 18.6 from the EDB installer, and 16 | The SQL only uses PostgreSQL 16 features, so it also runs in the lab |
| Python | 3.12 | For the backend |
| Node.js | 20.20 | Vite 8 needs Node 20.19 or newer (or 22.12+) |
| Internet | | Open-Meteo (data) and OpenStreetMap (map tiles) |

## Manual setup, step by step (macOS)

`start.py` runs these same steps for you. Doing them by hand shows what each one does, and helps when something fails.

Every command starts in the **project folder**, the one that holds this README. In Terminal, go there first, for example:

```bash
cd "$HOME/climate-intelligence-system"
```

### 1. PostgreSQL and pgAdmin
Install PostgreSQL with the **EDB installer** (postgresql.org → Download → macOS). It installs the server (port 5432,
starts automatically with the Mac), pgAdmin 4 and `psql`. Remember the password you choose for the `postgres` user.

On macOS the installer doesn't put `psql` on your PATH, so we use its full path. Check that the server is running:

```bash
/Library/PostgreSQL/18/bin/pg_isready
```

Expected: `/tmp:5432 - accepting connections`.

### 2. Create the database (once)
- **pgAdmin:** Servers → PostgreSQL 18 → right-click *Databases* → *Create* → *Database…* → name `climate_db` → *Save*.
- **psql:**

```bash
/Library/PostgreSQL/18/bin/psql -U postgres -d postgres -f database/00_create_database.sql
```

psql asks for the `postgres` password. Nothing appears while you type it; that's normal.

### 3. Build the tables
Run these six files **in this order**, connected to `climate_db`:
`reset.sql` → `01_schema.sql` → `02_seed.sql` → `03_views_functions.sql` → `04_triggers.sql` → `05_live_updates.sql`.
`reset.sql` is harmless on an empty database; it's there so the same steps also rebuild an existing one.
`05_live_updates.sql` adds the live-update triggers; it is safe to run again at any time.

- **pgAdmin:** click `climate_db` → *Tools* → *Query Tool*. For each file: *Open File* (folder icon) → pick the file →
  *Execute* (▶ or F5) → wait for "Query returned successfully" before opening the next one.
- **psql:** one command, one password prompt, and it stops at the first error:

```bash
/Library/PostgreSQL/18/bin/psql -U postgres -d climate_db -v ON_ERROR_STOP=1 -f database/reset.sql -f database/01_schema.sql -f database/02_seed.sql -f database/03_views_functions.sql -f database/04_triggers.sql -f database/05_live_updates.sql
```

Then run the smoke test. It tests the constraints, the view, the function and the trigger inside one transaction and
ends with `ROLLBACK`, so it leaves nothing behind:

```bash
/Library/PostgreSQL/18/bin/psql -U postgres -d climate_db -f database/smoke_test.sql
```

Expected last line of the messages: `SUMMARY: all 16 checks passed`. In pgAdmin, read the *Messages* tab.

### 4. Settings: the `.env` file
Make your own copy of the template (`-n` means it never overwrites an existing `.env`):

```bash
cp -n .env.example .env
```

Open it with `open -e .env` (Finder hides files whose names start with a dot; ⌘⇧. shows them) and fill in:

| Setting | What to put |
|---|---|
| `DB_PASSWORD` | the `postgres` password from step 1 |
| `JWT_SECRET` | a long random string that signs logins. Make one with the command below |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | the website's admin login (password: 8 to 72 characters) |
| `DEMO_USER_PASSWORD` | optional: one demo user per region gets this password |

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

`.env` is listed in `.gitignore`. Never commit it or send it to anyone. The code never contains a password; it
reads them all from `.env`.

### 5. The backend's Python environment

```bash
cd backend && python3.12 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt
```

This makes a private Python environment in `backend/.venv` and installs the exact package versions we tested.

### 6. Load 90 days of readings

```bash
cd backend && .venv/bin/python -m scripts.backfill
```

This takes about 10 to 15 seconds:
- It downloads 90 days of hourly weather for all 10 stations from the Open-Meteo **Historical Forecast API**, air quality
  from the **Air Quality API**, and the 7-day forecast.
- It works out the 22 values of each reading and stores everything in **one transaction**: 21,600 readings
  (10 stations × 24 hours × 90 days), plus today's hours so far.
- The trigger raises warnings as the rows go in. How many depends on the dates: our first load (1 July to 29 September)
  raised 39 Rain warnings.

It is safe to run again: readings that are already stored are skipped (`ON CONFLICT DO NOTHING`), so a re-run
only fills gaps. The backfill is hourly; once the API runs (step 8), it adds a new reading every 15 minutes. To see
what's in the database:

```bash
cd backend && .venv/bin/python -m scripts.report
```

### 7. Create the accounts

```bash
cd backend && .venv/bin/python -m scripts.create_users
```

This creates the admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD`) and, if `DEMO_USER_PASSWORD` is set, one demo user per region,
such as `colaba.demo@example.com`. The passwords come only from `.env` and are stored as bcrypt hashes. Running it again
updates the same accounts instead of creating duplicates.

### 8. Start the API

```bash
cd backend && .venv/bin/python -m uvicorn app.main:app --reload --timeout-graceful-shutdown 3
```

- Leave this terminal open. The API runs at <http://127.0.0.1:8000>. Its interactive docs (Swagger) are at
  <http://127.0.0.1:8000/docs>: click **Authorize** and use the admin email as the *username*.
- The **15-minute job** runs inside this server at :00, :15, :30 and :45 (IST) while `ENABLE_SCHEDULER=true`.
- The server also keeps one connection that has run `LISTEN climate_live`, and passes every change on to the open
  pages (the live updates).
- `--reload` restarts the server when a `.py` file changes. Edits to `.sql` files apply at once, because every
  query file is read fresh on each request. `--timeout-graceful-shutdown 3` lets Ctrl+C stop the server within
  3 seconds even while pages hold a live-update stream open.

### 9. Start the website
In a **second** terminal, from the project folder:

```bash
cd frontend && npm install && npm run dev
```

Open <http://localhost:5173>. `npm install` is only needed the first time, or after `package.json` changes.

### 10. Log in
Click **Log in** and use `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`. **Analytics**, **Integrity** and **Admin**
then appear in the menu; every other account only sees **Dashboard**. The demo users log in as
`<region>.demo@example.com` with `DEMO_USER_PASSWORD`, and see their own region first.

## Everyday use
PostgreSQL starts by itself with the computer. After that, one command starts the API and the website and opens the
site: `python3 start.py` (Windows: `py start.py`). It also catches up on any readings missed while the computer was
off. Press Ctrl+C in its window to stop.

The same thing by hand takes two terminals. The API's `--reload` restarts it whenever you save a `.py` file, which is
handy while changing the code:

| Terminal | Command | What it runs |
|---|---|---|
| 1 | `cd backend && .venv/bin/python -m uvicorn app.main:app --reload --timeout-graceful-shutdown 3` | the API on port 8000, plus the 15-minute Open-Meteo job and the live updates |
| 2 | `cd frontend && npm run dev` | the website on <http://localhost:5173> |

Stop either one with Ctrl+C. Started this way, nothing catches up on missed readings by itself: fill the gap with
`cd backend && .venv/bin/python -m scripts.backfill --days 3`, or with **Admin → Ingestion → Run now** on the website.

**How the live updates work.** When a transaction that changes readings, warnings, forecasts or the run log commits,
a trigger has called `pg_notify('climate_live', '<table>')` (database/05_live_updates.sql). The API hears it and
tells every open page through `/api/live`, and each part of the page that shows that table fetches its data again.
It works for changes made anywhere: the 15-minute job, the admin pages, or a plain `UPDATE` in pgAdmin. A tab in the
background pauses its stream and catches up as soon as you look at it again.

## The website's pages

| Page | Who can open it | What it shows |
|---|---|---|
| **Landing** (`/`) | everyone | what the project is, why we built it, who we are, and the way in: *Log in* or *Create your account* |
| **Dashboard** (`/dashboard`) | anyone logged in | "Is there a warning for your area today?" with a "What this means for you" line, a navy "right now" panel (temperature, how it feels, chance of rain each day), overview tiles, today's hour cards, the week with temperature ranges, a wind compass, sunrise and sunset, one history card with tabs (each with a table view), the station map, recent warnings and all 22 reading values. An area search switches area. It all updates by itself; a "Live" line shows the connection |
| **Analytics** | the team (admin login) | 5 DBMS queries, each next to its SQL: GROUP BY + HAVING, RANK(), a 7-day moving average, a correlated subquery and a multi-table join |
| **Integrity** | the team (admin login) | the poster's Table 4 checks, run live on the current data, with PASS/FAIL and the SQL |
| **Admin → Tables** | the team (admin login) | view, insert, edit and delete rows in all 7 poster tables plus WARNING_THRESHOLD, showing the SQL each change ran and which constraint refused a bad value |
| **Admin → Warnings** | the team (admin login) | issue, edit, clear and delete warnings |
| **Admin → Ingestion** | the team (admin login) | run an ingestion now, see the next scheduled run (every 15 minutes) and the run log, which updates by itself |

Everyone else who opens a team page sees the same "We couldn't find that page" as for a mistyped address, so normal
users never learn these pages exist, and nothing on their pages mentions admins, IDs or table names. The API enforces
the same rules: 401 without a login, 403 for a normal account on the team's endpoints.

## Handy commands
Run these from the `backend` folder (`cd backend` first).

| What | Command |
|---|---|
| Load or re-fill the last N days | `.venv/bin/python -m scripts.backfill --days 7` |
| Run the 15-minute job once, now | `.venv/bin/python -m scripts.ingest_now` |
| Report: rows, NULLs, warnings, last runs | `.venv/bin/python -m scripts.report` |
| Create or update the accounts from `.env` | `.venv/bin/python -m scripts.create_users` |
| Get the database ready: create, build, load and catch up (what start.py runs first) | `.venv/bin/python -m scripts.prepare` |
| Run only the 15-minute job, without the web server | `.venv/bin/python -m app.ingestion.scheduler` |
| All backend tests | `.venv/bin/python -m pytest -v` |

If you run the scheduler on its own, set `ENABLE_SCHEDULER=false` in `.env` while the API is also running. Two
schedulers would not corrupt anything, because an advisory lock lets only one run at a time, but the second one
would just log "skipped".

## Tests
- **Database:** `database/smoke_test.sql` runs 16 checks on the constraints, the trigger rules, the view, the function and the
  drop order, then rolls everything back (step 3 above).
- **Backend:** `cd backend && .venv/bin/python -m pytest -v` runs 84 tests: the derived-value formulas (CPCB AQI, wet bulb,
  "so far today" values, hourly and every 15 minutes), every API route, who may see what (visitor, user, team), the
  live updates (one message per committed transaction, none after a ROLLBACK, the stream itself), and checks that the
  SQL files and VIVA.md agree.
  The API tests build a **separate database, `climate_test`**, on the same server (with the `DB_...` settings from `.env`),
  rebuild it from `database/01`–`05` on every run, and never touch `climate_db`. You can drop `climate_test` at any time.

## Start again from an empty database
This **deletes all data**. Stop the API first (Ctrl+C), then rebuild the tables (step 3):

```bash
/Library/PostgreSQL/18/bin/psql -U postgres -d climate_db -v ON_ERROR_STOP=1 -f database/reset.sql -f database/01_schema.sql -f database/02_seed.sql -f database/03_views_functions.sql -f database/04_triggers.sql -f database/05_live_updates.sql
```

Then repeat step 6 (backfill) and step 7 (accounts), and start the API again.

## Windows notes
The easy way is the same one command, run in the project folder: `py start.py`. It handles the paths and the encoding
details below by itself.

For the manual steps, everything works the same way on Windows; only the paths and a few commands differ (PowerShell
shown):

- **PostgreSQL:** use the EDB installer for Windows; it includes pgAdmin. `psql` is
  `C:\Program Files\PostgreSQL\18\bin\psql.exe`. Our SQL files contain `°C` and `µg/m³`, so tell psql they are UTF-8 before
  running them (pgAdmin needs nothing):

  ```powershell
  $env:PGCLIENTENCODING = "UTF8"
  & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -d climate_db -v ON_ERROR_STOP=1 -f database/reset.sql -f database/01_schema.sql -f database/02_seed.sql -f database/03_views_functions.sql -f database/04_triggers.sql -f database/05_live_updates.sql
  ```

- **Settings:** `Copy-Item .env.example .env` (the first time only), then `notepad .env`.
- **Python:** install Python 3.12 from python.org. Wherever this README says `.venv/bin/python`, use `.venv\Scripts\python`:

  ```powershell
  cd backend
  py -3.12 -m venv .venv
  .venv\Scripts\python -m pip install -r requirements.txt
  .venv\Scripts\python -m scripts.backfill
  .venv\Scripts\python -m uvicorn app.main:app --reload --timeout-graceful-shutdown 3
  ```

  Windows has no built-in time-zone database. The `tzdata` package provides `Asia/Kolkata`, and `pip` installs it
  automatically as part of the requirements (APScheduler needs it).
- **Website:** the same `npm install` and `npm run dev`.

## Troubleshooting

| What you see | Cause and fix |
|---|---|
| `python3: command not found`, or `'py' is not recognized` | Python isn't installed. Install Python 3.12 from python.org (on Windows, tick *Add python.exe to PATH*), open a new terminal, and run the command again. |
| start.py: "Node.js is not installed" or "too old" | Install the LTS version from nodejs.org, then open a new terminal. |
| start.py: "The backend needs Python 3.12" | Your Python is too old for the backend. Install Python 3.12 from python.org; start.py finds it by itself. |
| start.py: "PostgreSQL refused the password" | It asks again: type the password you chose in the PostgreSQL installer. It's saved in `.env` for next time. |
| start.py: "Could not reach PostgreSQL" | PostgreSQL isn't running (pgAdmin shows whether it is), or it uses another port: put that port in `DB_PORT` in `.env`. |
| start.py: "Port 8000 (or 5173) is used by another program" | Another program, or a second copy of this project, already uses that port. Close it and run start.py again. |
| You forgot the website's admin password | It's the `ADMIN_PASSWORD` line in `.env`. To change it, edit that line, then run `cd backend && .venv/bin/python -m scripts.create_users`. |
| `psql: command not found` | The EDB installer doesn't add psql to PATH. Use the full path `/Library/PostgreSQL/18/bin/psql`. |
| `password authentication failed for user "postgres"` | Wrong password (often a typo; try again). For the backend, check `DB_PASSWORD` in `.env`. |
| `database "climate_db" does not exist` | Do step 2 first. |
| `relation "location" already exists` | `01_schema.sql` was run twice. Run the whole step 3 command, which starts with `reset.sql`. |
| `cannot drop table location because other objects depend on it` (SQLSTATE **2BP01**) | A parent table was dropped before its children: the lesson from our poster. `reset.sql` drops things in the safe order (the view, then child tables, then parents, then functions) and never uses CASCADE. |
| `could not connect to server` / `Connection refused` on port 5432 | PostgreSQL isn't running. Restart the Mac, or open pgAdmin to check. Make sure no second PostgreSQL uses port 5432: if you installed Homebrew's `postgresql@16`, stop it with `brew services stop postgresql@16`. |
| Homebrew PostgreSQL 16 won't start: `postmaster became multithreaded` | Only matters if you test on Homebrew's PG16: start it with `LC_ALL=en_US.UTF-8` set. Our main server is the EDB one. |
| The website says `Can't reach the API at http://127.0.0.1:8000` | The API isn't running: run start.py, or do step 8. If you run it on another port, put `VITE_API_URL=http://127.0.0.1:<port>` in `frontend/.env.local` and restart `npm run dev`. |
| Browser console: `blocked by CORS policy` | The website's address isn't in `CORS_ORIGINS` in `.env`. Add it exactly (scheme, host and port, e.g. `http://localhost:5173`), then restart the API. |
| `Port 5173 is already in use` | Another `npm run dev` is still running; stop it with Ctrl+C in its terminal. The port is fixed on purpose, because CORS allows exactly that address. |
| An API call returns 503 "The database is not reachable" | PostgreSQL stopped, or a `DB_...` value in `.env` is wrong. |
| `Not started: another ingestion run is already in progress` | The 15-minute job or the admin's Run button is busy. Wait a minute (see the advisory lock in VIVA.md). |
| The dashboard says "Reconnecting…" or "Can't reach the server right now" | The API stopped or is restarting. The page keeps the last data, reconnects by itself and catches up. If it stays that way, start the API again (start.py). |
| The dashboard never shows "Live", but everything else works | The API is from before the live updates. Stop start.py with Ctrl+C and run it again, so it starts the new API and adds the triggers (`05_live_updates.sql`). |
| `Could not download from Open-Meteo` | No internet, or Open-Meteo is down. Try again later. Nothing was half-saved: each run is one transaction. |
| Everyone is logged out after the API restarts | `JWT_SECRET` in `.env` is empty, so the server makes a temporary one at every start. Set it (step 4). |
| "We couldn't find that page" on Analytics, Integrity or Admin | Those pages are only for the admin login. Log out, then log in with `ADMIN_EMAIL`. |
| The admin form refuses an email ending in `.test` or `.local` | The email checker rejects reserved domains. Use `example.com` for made-up addresses. |
| No warnings on the map | Normal outside heavy rain: warnings start at 64.5 mm of rain since midnight, 40 °C, or AQI 301. VIVA.md's live demo shows how to trigger one. |
| `ModuleNotFoundError: No module named 'app'` | Run the scripts from the `backend` folder with `-m` (`.venv/bin/python -m scripts.backfill`), not as `python scripts/backfill.py`. |
| pytest: `permission denied to create database` | The tests create `climate_test`, so `DB_USER` needs the CREATEDB right (`postgres` has it). |

## Data sources and credits
- **Weather and air quality:** [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0), using the Historical Forecast API
  (backfill, hourly), the Forecast API (the 15-minute values and the 7-day forecast) and the Air Quality API (CAMS model:
  PM2.5, PM10, ozone, CO₂). These are model values at each station's position, not the station's own instrument
  readings. For India, Open-Meteo's 15-minute values are smoothed between its hourly model values. The live job makes
  at most about 2,700 calls a day, well under the free limit of 10,000.
- **Station positions:** NOAA NCEI Integrated Surface Database station history (the WMO stations), and GeoNames for Thane
  and Vashi.
- **AQI bands:** CPCB National Air Quality Index (2014). **Rain thresholds:** IMD rainfall categories (heavy 64.5 mm,
  very heavy 115.6 mm, extremely heavy 204.5 mm). The website's warnings are simplified and are not official IMD warnings.
- **Map tiles:** © OpenStreetMap contributors.
