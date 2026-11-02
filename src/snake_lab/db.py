"""SQLite lifecycle: open connections, initialize the schema, and close resources."""

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY,
    run_id TEXT NOT NULL UNIQUE,
    player_name TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('classic', 'sprint')),
    score INTEGER NOT NULL CHECK (score >= 0),
    food_eaten INTEGER NOT NULL CHECK (food_eaten BETWEEN 0 AND 397),
    duration_ms INTEGER NOT NULL CHECK (duration_ms BETWEEN 0 AND 86400000),
    outcome TEXT NOT NULL CHECK (outcome IN ('collision', 'won')),
    completed_at TEXT NOT NULL,
    CHECK (score = food_eaten * 10)
);
CREATE INDEX IF NOT EXISTS scores_player_mode ON scores(player_name, mode);
CREATE INDEX IF NOT EXISTS scores_mode_ranking ON scores(mode, score DESC, duration_ms, id);
"""


@contextmanager
def connect(database_path: Path) -> Iterator[sqlite3.Connection]:
    """Use one connection per request; roll back the transaction on exceptions.

    FastAPI may run the dependency and route on different threads. The connection
    still belongs to one request: use check_same_thread=False, with no global pool.
    `with connection` commits/rolls back but does NOT close; finally handles closing.
    """
    connection = sqlite3.connect(database_path, timeout=5, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    try:
        with connection:
            yield connection
    finally:
        connection.close()


def initialize(database_path: Path) -> None:
    """Create the database during application startup, not during module import."""
    database_path.parent.mkdir(parents=True, exist_ok=True)
    with connect(database_path) as connection:
        connection.execute("PRAGMA journal_mode=WAL")
        connection.executescript(SCHEMA)
