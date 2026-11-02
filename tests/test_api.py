"""Integration tests: HTTP -> validation -> service -> real SQLite."""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from snake_lab.main import create_app


def test_health_frontend_and_openapi(client: TestClient) -> None:
    assert client.get("/api/health").json() == {"status": "ok"}
    assert "Small game." in client.get("/").text
    assert client.get("/app.mjs").status_code == 200
    assert client.get("/style.css").status_code == 200
    assert "/api/scores" in client.get("/openapi.json").json()["paths"]
    assert client.get("/docs").status_code == 200
    assert client.get("/api/missing").status_code == 404
    assert client.get("/../../pyproject.toml").status_code == 404


def test_score_is_derived_and_persisted(client: TestClient, payload: dict) -> None:
    result = client.post("/api/scores", json=payload)
    assert result.status_code == 201
    assert result.json()["score"] == 30
    assert result.json()["completed_at"].endswith("Z")
    assert client.get("/api/stats").json() == {
        "games_played": 1,
        "players": 1,
        "best_score": 30,
    }


def test_normalized_nickname(client: TestClient, payload: dict) -> None:
    payload["player_name"] = "  ALIce  "
    assert client.post("/api/scores", json=payload).json()["player_name"] == "alice"
    assert client.get("/api/players/ALICE/analytics").json()["games_played"] == 1


def test_retry_is_idempotent_and_conflict_preserves_original(
    client: TestClient, payload: dict
) -> None:
    first = client.post("/api/scores", json=payload)
    retry = client.post("/api/scores", json=payload)
    assert retry.status_code == 200
    assert retry.json() == first.json()
    conflict = client.post("/api/scores", json={**payload, "food_eaten": 4})
    assert conflict.status_code == 409
    stats = client.get("/api/players/alice/analytics").json()
    assert stats["games_played"] == 1
    assert stats["total_food"] == 3


def test_concurrent_retry_creates_one_run(client: TestClient, payload: dict) -> None:
    with ThreadPoolExecutor(max_workers=4) as pool:
        responses = list(pool.map(lambda _: client.post("/api/scores", json=payload), range(4)))
    assert sorted(response.status_code for response in responses) == [200, 200, 200, 201]
    assert client.get("/api/stats").json()["games_played"] == 1


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("food_eaten", -1),
        ("food_eaten", 398),
        ("food_eaten", 1.5),
        ("food_eaten", True),
        ("food_eaten", "3"),
        ("duration_ms", -1),
        ("duration_ms", 86_400_001),
        ("duration_ms", False),
        ("duration_ms", 1.5),
        ("mode", "turbo"),
        ("outcome", "unknown"),
        ("outcome", "won"),
        ("run_id", "not-a-uuid"),
        ("player_name", "a"),
        ("player_name", " "),
        ("player_name", "a" * 21),
        ("player_name", "<script>"),
        ("player_name", "two words"),
        ("player_name", "alice\n" + "x"),
        ("score", 999),
        ("completed_at", "2026-01-01"),
    ],
)
def test_bad_payload_returns_422_without_writing(
    client: TestClient, payload: dict, field: str, value: object
) -> None:
    response = client.post("/api/scores", json={**payload, field: value})
    assert response.status_code == 422
    assert client.get("/api/stats").json()["games_played"] == 0


def test_missing_field_returns_422(client: TestClient, payload: dict) -> None:
    del payload["run_id"]
    assert client.post("/api/scores", json=payload).status_code == 422


def test_full_board_requires_win(client: TestClient, payload: dict) -> None:
    payload["food_eaten"] = 397
    assert client.post("/api/scores", json=payload).status_code == 422
    payload["outcome"] = "won"
    assert client.post("/api/scores", json=payload).json()["score"] == 3970
    assert client.get("/api/players/alice/analytics").json()["wins"] == 1


def test_leaderboard_best_per_player_mode_and_ties(client: TestClient, payload: dict) -> None:
    runs = [
        ("alice", "classic", 4, 5000),
        ("alice", "classic", 2, 1000),
        ("bob", "classic", 4, 3000),
        ("carol", "classic", 4, 3000),
        ("dave", "sprint", 20, 9000),
    ]
    for name, mode, food, duration in runs:
        assert (
            client.post(
                "/api/scores",
                json={
                    **payload,
                    "run_id": str(uuid4()),
                    "player_name": name,
                    "mode": mode,
                    "food_eaten": food,
                    "duration_ms": duration,
                },
            ).status_code
            == 201
        )
    board = client.get("/api/leaderboard").json()
    assert [entry["player_name"] for entry in board] == ["bob", "carol", "alice"]
    assert [entry["rank"] for entry in board] == [1, 2, 3]
    assert board[2]["score"] == 40
    assert len(client.get("/api/leaderboard?limit=2").json()) == 2
    assert client.get("/api/leaderboard?mode=sprint").json()[0]["player_name"] == "dave"


@pytest.mark.parametrize("query", ["limit=0", "limit=51", "limit=no", "mode=bad"])
def test_invalid_leaderboard_query(client: TestClient, query: str) -> None:
    assert client.get(f"/api/leaderboard?{query}").status_code == 422


def test_empty_analytics_and_stats(client: TestClient) -> None:
    assert client.get("/api/leaderboard").json() == []
    analytics = client.get("/api/players/new-player/analytics").json()
    assert analytics == {
        "player_name": "new-player",
        "mode": "classic",
        "games_played": 0,
        "best_score": 0,
        "average_score": 0,
        "total_food": 0,
        "total_duration_ms": 0,
        "wins": 0,
        "recent_runs": [],
    }
    assert client.get("/api/stats").json() == {
        "games_played": 0,
        "players": 0,
        "best_score": 0,
    }


def test_analytics_aggregates_all_runs_but_bounds_history(
    client: TestClient, payload: dict
) -> None:
    for food in range(12):
        client.post("/api/scores", json={**payload, "run_id": str(uuid4()), "food_eaten": food})
    client.post("/api/scores", json={**payload, "run_id": str(uuid4()), "mode": "sprint"})
    analytics = client.get("/api/players/alice/analytics").json()
    assert analytics["games_played"] == 12
    assert analytics["best_score"] == 110
    assert analytics["average_score"] == 55
    assert analytics["total_food"] == 66
    assert analytics["total_duration_ms"] == 60000
    assert [row["score"] for row in analytics["recent_runs"]] == list(range(110, 10, -10))
    assert client.get("/api/players/alice/analytics?mode=sprint").json()["games_played"] == 1


def test_database_survives_app_restart(tmp_path: Path, payload: dict) -> None:
    path = tmp_path / "nested" / "persistent.sqlite3"
    with TestClient(create_app(path)) as first:
        first.post("/api/scores", json=payload)
    with TestClient(create_app(path)) as restarted:
        assert restarted.get("/api/leaderboard").json()[0]["score"] == 30


def test_factory_reads_environment(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    path = tmp_path / "custom.sqlite3"
    monkeypatch.setenv("SNAKE_DB_PATH", str(path))
    app = create_app()
    assert not path.exists()  # Importing or creating the app does not create the database.
    with TestClient(app) as test_client:
        assert test_client.get("/api/health").status_code == 200
    assert path.exists()


def test_sql_injection_handle_is_rejected(client: TestClient, payload: dict) -> None:
    payload["player_name"] = "x'; DROP TABLE scores;--"
    assert client.post("/api/scores", json=payload).status_code == 422
    assert client.get("/api/health").status_code == 200


def test_operational_error_returns_retryable_status(
    client: TestClient, payload: dict, monkeypatch: pytest.MonkeyPatch
) -> None:
    import sqlite3

    from snake_lab.repository import ScoreRepository

    def unavailable(*args: object) -> None:
        raise sqlite3.OperationalError("database is locked")

    monkeypatch.setattr(ScoreRepository, "insert_or_get", unavailable)
    assert client.post("/api/scores", json=payload).status_code == 503
