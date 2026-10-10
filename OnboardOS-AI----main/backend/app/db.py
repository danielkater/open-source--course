import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / '.env')


def now():
    return datetime.now(timezone(timedelta(hours=8))).isoformat(timespec='seconds')


def today():
    return datetime.now(timezone(timedelta(hours=8))).date()


@contextmanager
def connect():
    path = Path(os.getenv('DATABASE_PATH') or ROOT / 'backend/data/onboardos.sqlite3')
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def initialize():
    with connect() as conn:
        conn.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS candidates (
          id INTEGER PRIMARY KEY, name TEXT NOT NULL, identity TEXT NOT NULL,
          job_category TEXT NOT NULL, position TEXT NOT NULL, employment TEXT NOT NULL,
          department TEXT NOT NULL, start_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY, candidate_id INTEGER NOT NULL REFERENCES candidates(id),
          code TEXT NOT NULL, title TEXT NOT NULL, kind TEXT NOT NULL, owner TEXT NOT NULL,
          status TEXT NOT NULL, dependencies TEXT NOT NULL, description TEXT NOT NULL,
          result TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL,
          UNIQUE(candidate_id, code)
        );
        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY, candidate_id INTEGER REFERENCES candidates(id),
          actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS proposals (
          id INTEGER PRIMARY KEY, candidate_id INTEGER NOT NULL REFERENCES candidates(id),
          title TEXT NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS followups (
          id INTEGER PRIMARY KEY, candidate_id INTEGER NOT NULL REFERENCES candidates(id),
          proposal_id INTEGER NOT NULL UNIQUE REFERENCES proposals(id), title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS notifications (
          id INTEGER PRIMARY KEY, candidate_id INTEGER NOT NULL REFERENCES candidates(id),
          message TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tool_logs (
          id INTEGER PRIMARY KEY, run_id TEXT NOT NULL, mode TEXT NOT NULL, role TEXT NOT NULL,
          tool TEXT NOT NULL, arguments TEXT NOT NULL, result TEXT NOT NULL,
          success INTEGER NOT NULL, duration_ms INTEGER NOT NULL, created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ix_tasks_candidate ON tasks(candidate_id);
        CREATE INDEX IF NOT EXISTS ix_logs_run ON tool_logs(run_id);
        ''')


def event(conn, candidate_id, actor, action, detail=''):
    conn.execute('INSERT INTO events(candidate_id,actor,action,detail,created_at) VALUES(?,?,?,?,?)',
                 (candidate_id, actor, action, detail, now()))
