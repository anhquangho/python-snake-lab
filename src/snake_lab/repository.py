"""Plain SQL with bound parameters makes persistence and aggregation explicit."""

import sqlite3
from datetime import UTC, datetime

from snake_lab.schemas import (
    LabStats,
    LeaderboardEntry,
    Mode,
    PlayerAnalytics,
    ScoreCreate,
    ScoreRead,
)


class ScoreRepository:
    """Work with the database without depending on HTTP status codes or the UI."""

    def __init__(self, connection: sqlite3.Connection) -> None:
        self.connection = connection

    def insert_or_get(self, payload: ScoreCreate, score: int) -> tuple[ScoreRead, bool]:
        """A UNIQUE run_id prevents duplicate runs, including concurrent retries.

        INSERT and SELECT share the dependency's transaction. The service compares
        payloads for an existing run_id to reject a different submission using that ID.
        """
        cursor = self.connection.execute(
            """INSERT INTO scores
               (run_id, player_name, mode, score, food_eaten, duration_ms, outcome, completed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(run_id) DO NOTHING""",
            (
                str(payload.run_id),
                payload.player_name,
                payload.mode.value,
                score,
                payload.food_eaten,
                payload.duration_ms,
                payload.outcome.value,
                datetime.now(UTC).isoformat(),
            ),
        )
        row = self.connection.execute(
            "SELECT * FROM scores WHERE run_id = ?", (str(payload.run_id),)
        ).fetchone()
        return ScoreRead.model_validate(dict(row)), cursor.rowcount == 1

    def leaderboard(self, mode: Mode, limit: int) -> list[LeaderboardEntry]:
        """Best per player; ties use score DESC, duration ASC, id ASC (earlier run).

        The first ROW_NUMBER picks each nickname's best run; the second assigns
        sequential ranks. completed_at is for display; id provides a stable tie-break.
        """
        rows = self.connection.execute(
            """WITH personal_bests AS (
                   SELECT *, ROW_NUMBER() OVER (
                       PARTITION BY player_name ORDER BY score DESC, duration_ms ASC, id ASC
                   ) AS personal_rank
                   FROM scores WHERE mode = ?
               )
               SELECT ROW_NUMBER() OVER (
                   ORDER BY score DESC, duration_ms ASC, id ASC
               ) AS rank, player_name, score, duration_ms, completed_at
               FROM personal_bests WHERE personal_rank = 1
               ORDER BY score DESC, duration_ms ASC, id ASC LIMIT ?""",
            (mode.value, limit),
        ).fetchall()
        return [LeaderboardEntry.model_validate(dict(row)) for row in rows]

    def analytics(self, player_name: str, mode: Mode) -> PlayerAnalytics:
        """Calculate COUNT/AVG/SUM in SQLite and return at most 10 recent runs."""
        row = self.connection.execute(
            """SELECT COUNT(*) AS games_played, COALESCE(MAX(score), 0) AS best_score,
                      COALESCE(ROUND(AVG(score), 2), 0) AS average_score,
                      COALESCE(SUM(food_eaten), 0) AS total_food,
                      COALESCE(SUM(duration_ms), 0) AS total_duration_ms,
                      COALESCE(SUM(outcome = 'won'), 0) AS wins
               FROM scores WHERE player_name = ? AND mode = ?""",
            (player_name, mode.value),
        ).fetchone()
        recent = self.connection.execute(
            """SELECT * FROM scores WHERE player_name = ? AND mode = ?
               ORDER BY id DESC LIMIT 10""",
            (player_name, mode.value),
        ).fetchall()
        return PlayerAnalytics(
            player_name=player_name,
            mode=mode,
            **dict(row),
            recent_runs=[ScoreRead.model_validate(dict(run)) for run in recent],
        )

    def stats(self) -> LabStats:
        """Summarize the entire lab across both game modes."""
        row = self.connection.execute(
            """SELECT COUNT(*) AS games_played, COUNT(DISTINCT player_name) AS players,
                      COALESCE(MAX(score), 0) AS best_score FROM scores"""
        ).fetchone()
        return LabStats.model_validate(dict(row))
