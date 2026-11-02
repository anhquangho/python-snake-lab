"""Fixtures: each test uses a real SQLite file in its own tmp_path."""

from collections.abc import Iterator
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from snake_lab.main import create_app


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    """Run lifespan, initialize the schema, and clean up the client after the test."""
    with TestClient(create_app(tmp_path / "test.sqlite3")) as test_client:
        yield test_client


@pytest.fixture
def payload() -> dict[str, object]:
    """Create a fresh UUID and dictionary for each test to avoid shared mutable state."""
    return {
        "run_id": str(uuid4()),
        "player_name": "alice",
        "mode": "classic",
        "food_eaten": 3,
        "duration_ms": 5000,
        "outcome": "collision",
    }
