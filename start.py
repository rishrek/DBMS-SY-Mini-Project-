#!/usr/bin/env python3
"""
Start the Climate Intelligence System website with one command.

    macOS / Linux:   python3 start.py
    Windows:         py start.py

The first run sets everything up (a few minutes, needs the internet):
  1. creates backend/.venv and installs the Python packages
  2. writes .env, asking for your PostgreSQL password and a new admin password
  3. creates the climate_db database, builds the tables, loads 90 days of
     readings and creates the admin account   (backend/scripts/prepare.py)
  4. installs the website's packages           (npm ci)
After that, every run checks those steps, starts the API and the website, and
opens http://localhost:5173. Press Ctrl+C in this window to stop both.

You need PostgreSQL, Python 3.12 (3.13 and 3.14 also work) and Node.js first;
see "Quick start" in README.md. This file uses only Python's standard library,
so it runs before anything else is installed.

Option:  --no-browser   start everything but don't open the browser
"""
from __future__ import annotations

import getpass
import os
import re
import secrets
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
ENV_FILE = ROOT / ".env"
LOGS = ROOT / "logs"
WINDOWS = os.name == "nt"
VENV_PYTHON = BACKEND / ".venv" / ("Scripts/python.exe" if WINDOWS else "bin/python")
API = "http://127.0.0.1:8000"
WEBSITE = "http://localhost:5173"
PYTHONS = ((3, 12), (3, 13), (3, 14))     # Python versions we tested the backend with, best first


# ----------------------------------------------------------------- small helpers
def say(text: str = "") -> None:
    print(text, flush=True)


def stop(text: str) -> None:
    """Explain a problem and quit."""
    say(f"\n{text}")
    sys.exit(1)


def run(command: list, cwd: Path = ROOT) -> None:
    """Run a command with its output on screen; quit if it fails."""
    if subprocess.run([str(part) for part in command], cwd=str(cwd)).returncode != 0:
        stop("That step failed (see the messages above). Fix it and run start.py again.")


def version_of(command: list) -> tuple | None:
    """(major, minor) of a Python command, or None if it doesn't run."""
    try:
        out = subprocess.run(command + ["-c", "import sys; print(*sys.version_info[:2])"],
                             capture_output=True, text=True, timeout=30)
        return tuple(int(x) for x in out.stdout.split()) if out.returncode == 0 else None
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return None


# ------------------------------------------------------------- 0. the tools we need
def check_node() -> tuple[str, str]:
    node, npm = shutil.which("node"), shutil.which("npm")
    if not node or not npm:
        stop("Node.js is not installed. Install the LTS version from https://nodejs.org, "
             "open a new terminal, and run this again.")
    found = subprocess.run([node, "--version"], capture_output=True, text=True).stdout.strip()   # e.g. v20.20.2
    major, minor = (int(x) for x in re.findall(r"\d+", found)[:2])
    if not ((major == 20 and minor >= 19) or (major == 22 and minor >= 12) or major >= 23):
        stop(f"Node.js {found} is too old for the website (it needs 20.19 or newer). "
             "Install the LTS version from https://nodejs.org.")
    return node, npm


def find_python() -> list | None:
    """This Python if the backend supports it, otherwise another installed version that it does."""
    candidates = [[sys.executable]]
    for major, minor in PYTHONS:
        candidates.append(["py", f"-{major}.{minor}"] if WINDOWS else [f"python{major}.{minor}"])
    for command in candidates:
        if command[0] != sys.executable and not shutil.which(command[0]):
            continue
        if version_of(command) in PYTHONS:
            return command
    return None


# --------------------------------------------------- 1. the backend's Python packages
def ensure_venv() -> None:
    requirements = BACKEND / "requirements.txt"
    installed = BACKEND / ".venv" / "installed-requirements.txt"     # a copy, to notice a changed list
    if not VENV_PYTHON.exists():
        python = find_python()
        if python is None:
            stop("The backend needs Python 3.12 (3.13 and 3.14 also work). Install it from "
                 "https://www.python.org/downloads/ (on Windows, tick 'Add python.exe to PATH'), "
                 "then run this again.")
        say(f"Creating the Python environment in backend/.venv (Python {'.'.join(map(str, version_of(python)))}) ...")
        run(python + ["-m", "venv", BACKEND / ".venv"])
    elif version_of([str(VENV_PYTHON)]) not in PYTHONS:
        stop("backend/.venv was made with a Python version the backend doesn't support. "
             "Delete the backend/.venv folder and run this again.")
    wanted = requirements.read_text(encoding="utf-8")
    if not installed.exists() or installed.read_text(encoding="utf-8") != wanted:
        say("Installing the Python packages (about a minute the first time) ...")
        run([VENV_PYTHON, "-m", "pip", "install", "--quiet", "--disable-pip-version-check", "-r", requirements])
        installed.write_text(wanted, encoding="utf-8")
    say("  [ok] Python packages")


# ---------------------------------------------------------------- 2. the .env file
def read_env() -> dict:
    values = {}
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        match = re.match(r"\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$", line)
        if match:
            values[match.group(1)] = match.group(2).strip("'\"")
    return values


def set_env(key: str, value: str) -> None:
    """Write KEY='value' into .env. Single quotes make .env readers take the value
    literally (spaces, # and $ included); only \\ and ' need a backslash."""
    line = f"{key}='" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"
    text = ENV_FILE.read_text(encoding="utf-8")
    pattern = re.compile(rf"^{key}=.*$", re.M)
    text = pattern.sub(lambda _: line, text, count=1) if pattern.search(text) else text.rstrip("\n") + f"\n{line}\n"
    ENV_FILE.write_text(text, encoding="utf-8")


def ask_database_password() -> None:
    say("Your PostgreSQL password: the one you chose when you installed PostgreSQL (user 'postgres').")
    set_env("DB_PASSWORD", getpass.getpass("  PostgreSQL password (hidden while you type): "))


def ask_admin_password(email: str) -> None:
    say(f"\nChoose a password for the website's admin login, {email} (8 to 72 characters).")
    while True:
        first = getpass.getpass("  New admin password (hidden while you type): ")
        if not 8 <= len(first.encode("utf-8")) <= 72:
            say("  It must be 8 to 72 characters. Try again.")
        elif getpass.getpass("  Type it again: ") != first:
            say("  The two didn't match. Try again.")
        else:
            set_env("ADMIN_PASSWORD", first)
            return


def ensure_env() -> None:
    new_file = not ENV_FILE.exists()
    if new_file:
        shutil.copyfile(ROOT / ".env.example", ENV_FILE)
        say("\nCreated .env (your settings; it stays on this computer, and git ignores it).")
        ask_database_password()
    values = read_env()
    if not values.get("JWT_SECRET"):
        set_env("JWT_SECRET", secrets.token_hex(32))         # signs logins; nobody needs to type it
    if not values.get("ADMIN_PASSWORD"):
        ask_admin_password(values.get("ADMIN_EMAIL") or "admin@example.com")
    say("  [ok] settings in .env")


# ---------------------------------------------------------- 3. the database and data
def prepare_database() -> None:
    for _ in range(3):
        code = subprocess.run([str(VENV_PYTHON), "-m", "scripts.prepare"], cwd=str(BACKEND)).returncode
        if code == 0:
            return
        if code == 3:                                            # wrong PostgreSQL password
            ask_database_password()
            continue
        if code == 2:
            stop("Start PostgreSQL (it normally starts with the computer; pgAdmin shows whether it runs). "
                 "If it uses a port other than 5432, change DB_PORT in .env. Then run this again.")
        stop("The database could not be prepared (see the message above).")
    stop("PostgreSQL still refuses the password. Check it by logging in with pgAdmin, then run this again.")


# ------------------------------------------------------------ 4. the website's packages
def ensure_node_modules(npm: str) -> None:
    lock = FRONTEND / "package-lock.json"
    installed = FRONTEND / "node_modules" / ".package-lock.json"          # npm writes this after installing
    if not installed.exists() or installed.stat().st_mtime < lock.stat().st_mtime:
        say("Installing the website's packages (about a minute the first time) ...")
        run([npm, "ci", "--no-audit", "--no-fund", "--loglevel=error"], cwd=FRONTEND)
    say("  [ok] website packages")


# ------------------------------------------------------------------ 5. run everything
NO_PROXY = urllib.request.build_opener(urllib.request.ProxyHandler({}))   # localhost: never via a proxy


def fetch(url: str) -> tuple:
    """(HTTP status, body) of a GET, or (None, b"") if nothing answers."""
    try:
        with NO_PROXY.open(url, timeout=3) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as error:
        return error.code, error.read()
    except (urllib.error.URLError, OSError):
        return None, b""


def port_in_use(port: int) -> bool:
    for host in ("127.0.0.1", "::1"):
        try:
            with socket.create_connection((host, port), timeout=0.5):
                return True
        except OSError:
            pass
    return False


def last_lines(log: Path, count: int = 25) -> None:
    lines = log.read_text(encoding="utf-8", errors="replace").splitlines()[-count:]
    say(f"\n--- last lines of {log.relative_to(ROOT)} ---\n" + "\n".join(lines))


def stop_all(servers: list) -> None:
    for _, process, _ in servers:
        if process.poll() is None:
            process.terminate()
    for _, process, _ in servers:
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()


def wait_until_up(url: str, name: str, servers: list) -> int:
    deadline = time.time() + 90
    while time.time() < deadline:
        status, _ = fetch(url)
        if status is not None:
            return status
        for label, process, log in servers:
            if process.poll() is not None:
                last_lines(log)
                stop(f"The {label} stopped while starting (the lines above say why).")
        time.sleep(0.5)
    stop(f"The {name} did not start within 90 seconds (see the logs folder).")
    return 0


def serve(node: str, open_browser: bool) -> None:
    api_up = port_in_use(8000)
    if api_up and fetch(API + "/api/health")[0] not in (200, 503):
        stop("Port 8000 is used by another program. Close it and run this again.")
    website_up = port_in_use(5173)
    if website_up and b"Climate Intelligence System" not in fetch(WEBSITE)[1]:
        stop("Port 5173 is used by another program. Close it and run this again.")

    LOGS.mkdir(exist_ok=True)
    servers = []                                   # (name, process, log file) for the ones WE start
    try:
        if not api_up:
            log = LOGS / "api.log"
            # --timeout-graceful-shutdown: open live-update streams never end by themselves,
            # so on Ctrl+C give them 3 seconds and then close them.
            command = [str(VENV_PYTHON), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000",
                       "--timeout-graceful-shutdown", "3"]
            servers.append(("API", subprocess.Popen(command, cwd=str(BACKEND), stdout=open(log, "w"),
                                                    stderr=subprocess.STDOUT), log))
        if not website_up:
            log = LOGS / "website.log"
            command = [node, str(FRONTEND / "node_modules" / "vite" / "bin" / "vite.js")]
            servers.append(("website", subprocess.Popen(command, cwd=str(FRONTEND), stdout=open(log, "w"),
                                                        stderr=subprocess.STDOUT), log))
        if wait_until_up(API + "/api/health", "API", servers) == 503:
            say("  [!]  The API is running but can't reach PostgreSQL; pages will show an error until it can.")
        wait_until_up(WEBSITE, "website", servers)

        admin = read_env().get("ADMIN_EMAIL") or "admin@example.com"
        say(f"\n  Website:      {WEBSITE}" + ("   (opening it in your browser)" if open_browser else ""))
        say(f"  API docs:     {API}/docs")
        say(f"  Admin login:  {admin}, with the ADMIN_PASSWORD in .env")
        say(f"  Logs:         logs/api.log and logs/website.log")
        if open_browser:
            webbrowser.open(WEBSITE)
        if not servers:
            say("\nBoth were already running (in another window), so there is nothing to stop here.")
            return
        say("\n  Leave this window open while you use the website. Press Ctrl+C to stop.")
        while True:                                # watch the servers until Ctrl+C
            for label, process, log in servers:
                if process.poll() is not None:
                    last_lines(log)
                    stop(f"The {label} stopped unexpectedly (the lines above say why).")
            time.sleep(1)
    except KeyboardInterrupt:
        say("\nStopping the website and the API ...")
    finally:
        stop_all(servers)
    say("Stopped.")                                # only reached after Ctrl+C


def main() -> None:
    if not (BACKEND / "requirements.txt").exists():
        stop("Run start.py from the project folder (the one with README.md).")
    say("Climate Intelligence System: getting the website ready")
    if not (ENV_FILE.exists() and VENV_PYTHON.exists() and (FRONTEND / "node_modules").exists()):
        say("First run: setting everything up. This takes a few minutes and needs the internet.\n")
    node, npm = check_node()
    ensure_venv()
    ensure_env()
    prepare_database()
    ensure_node_modules(npm)
    serve(node, open_browser="--no-browser" not in sys.argv[1:])


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        say("\nStopped.")
        sys.exit(130)
