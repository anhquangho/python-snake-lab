"""Verify real transaction rollback without mocking SQLite."""

import sqlite3
from pathlib import Path

import pytest

from snake_lab.db import connect, initialize


def test_transaction_rolls_back_on_error(tmp_path: Path) -> None:
    path = tmp_path / "rollback.sqlite3"
    initialize(path)
    with connect(path) as connection:
        connection.execute("CREATE TABLE notes (body TEXT)")
    with pytest.raises(RuntimeError), connect(path) as connection:
        connection.execute("INSERT INTO notes VALUES (?)", ("should disappear",))
        raise RuntimeError("simulate a failed request")
    with connect(path) as connection:
        assert connection.execute("SELECT COUNT(*) FROM notes").fetchone()[0] == 0


def test_schema_rejects_inconsistent_score(tmp_path: Path) -> None:
    path = tmp_path / "constraints.sqlite3"
    initialize(path)
    with pytest.raises(sqlite3.IntegrityError), connect(path) as connection:
        connection.execute(
            """INSERT INTO scores VALUES (1, 'uuid', 'alice', 'classic',
               999, 1, 1000, 'collision', '2026-01-01T00:00:00+00:00')"""
        )
